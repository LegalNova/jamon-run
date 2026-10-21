import { AIParams, BALANCE, CITY, Difficulty, HYPE, PARON, PHRASES, TILE } from '../balance';
import { resolveCircle } from '../collision';
import { DistField, Grid, SHOT_BLOCKERS, Terrain } from '../grid';
import { MapId } from '../maps';
import { buildRows, MapScale } from '../mapScale';
import { abilityFor, canMoveFor, createMode, emptyModeNet, GameMode, ModeNet, speedMulFor } from '../modes';
import { buildProps, Prop } from '../props';
import { BotBrain, BotWorld } from './Bot';
import { SimChar, wrapAngle, PRESS_BUFFER } from './Char';
import { Hype } from './Hype';
import { Ability, emptyIntent, HeldInput, Intent, MatchState, ModeId, PickupType, RosterEntry, SimCtx, SimEvent, Team } from './types';


export class SimProjectile {
  travelled = 0;
  dead = false;
  constructor(readonly pid: number, readonly owner: number, public x: number, public y: number, readonly dx: number, readonly dy: number) {}
}

export class SimSmoke {
  life: number = BALANCE.escapist.smokeDuration;
  readonly radius: number = BALANCE.escapist.smokeRadius;
  dead = false;
  constructor(readonly sid: number, readonly x: number, readonly y: number) {}
  contains(px: number, py: number): boolean {
    return (px - this.x) ** 2 + ((py - this.y) * 1.2) ** 2 < this.radius * this.radius;
  }
}

export class SimPickup {
  life: number = BALANCE.items.lifetime;
  dead = false;
  constructor(readonly iid: number, readonly type: PickupType, readonly x: number, readonly y: number, readonly spawnIndex: number) {}
}

export interface SimOptions {
  mapId: MapId;
  scale: MapScale;
  duration: number;
  difficulty: Difficulty;
  roster: RosterEntry[];
  mode?: ModeId;
  /** Semilla de los objetos del mapa (Escondite). */
  seed?: number;
  /** Parón Dopamina (minijuego a mitad de partida). */
  paron?: boolean;
}

/** Hint sonoro reciente (la IA de los buscadores lo usa). */
export interface HintMark {
  x: number;
  y: number;
  t: number;
}

/**
 * La partida completa, sin gráficos: reglas, personajes, IA, objetos y proyectiles.
 * La ejecutan el navegador (modo offline) y el servidor (modo online).
 */
export class Sim implements SimCtx, BotWorld {
  readonly grid: Grid;
  readonly mapId: MapId;
  readonly mode: ModeId;
  readonly modeImpl: GameMode;
  readonly hype: Hype;
  readonly seed: number;
  /** Objetos del mapa (Escondite). */
  readonly props: Prop[];
  /** Fase del modo (Escondite: 0 = esconderse). */
  phase = 1;
  /** Ganador individual (Jamón Bomba, Leyenda de Infección). */
  champion = -1;
  hints: HintMark[] = [];
  /** Congelada por el Parón: nadie se mueve, nadie recibe golpes, el reloj no avanza. */
  frozen = false;
  readonly paronAt: number;
  private paronDone: boolean;
  readonly scale: MapScale;
  readonly ai: AIParams;
  readonly duration: number;
  timeLeft: number;
  matchTime = 0;
  state: MatchState = 'countdown';
  countdown: number = BALANCE.match.countdown;
  winner: Team | null = null;

  chars: SimChar[] = [];
  readonly byId = new Map<number, SimChar>();
  pickups: SimPickup[] = [];
  projectiles: SimProjectile[] = [];
  smokes: SimSmoke[] = [];

  private events: SimEvent[] = [];
  private brains = new Map<number, BotBrain>();
  private held = new Map<number, HeldInput>();
  private nextPid = 1;
  private nextSid = 1;
  private nextIid = 1;
  private itemTimer: number = BALANCE.items.firstSpawn;
  private danger: DistField | null = null;
  private dangerTimer = 0;
  private released = false;
  /** Viento de levante (solo Ceuta). */
  wind = { x: 0, y: 0 };
  private windTimer: number = CITY.levante.firstAt;
  private windOn = false;
  private windDir = -1;
  private streaks = new Map<number, { t: number; n: number }>();
  private barriers: { tiles: number[]; t: number }[] = [];

  constructor(o: SimOptions) {
    this.mapId = o.mapId;
    this.scale = o.scale;
    this.mode = o.mode ?? 'pilla';
    this.seed = o.seed ?? Math.floor(Math.random() * 1e9);
    this.grid = new Grid(buildRows(o.mapId, o.scale));
    this.ai = BALANCE.ai[o.difficulty];
    // Jamón Bomba va por rondas: el tiempo es solo un tope de seguridad.
    this.duration = this.mode === 'bomba' ? 600 : o.duration;
    this.timeLeft = this.duration;
    this.props = this.mode === 'escondite' ? buildProps(this.grid, this.seed) : [];
    this.modeImpl = createMode(this.mode);
    this.paronDone = o.paron === false;
    const [a, b] = this.mode === 'bomba' ? PARON.bombaAt : [PARON.at[0] * this.duration, PARON.at[1] * this.duration];
    this.paronAt = a + Math.random() * (b - a);
    this.spawn(o.roster);
    this.modeImpl.setup(this);
    this.hype = new Hype(this);
  }

  random(): number {
    return Math.random();
  }

  isHunter(c: SimChar): boolean {
    return this.modeImpl.isHunter(c);
  }

  canPickup(c: SimChar, type: PickupType): boolean {
    return type === 'coin' || this.modeImpl.canPickup(c, type);
  }

  // ------------------------------------------------------------------ preparación

  private spawn(roster: RosterEntry[]): void {
    const g = this.grid;
    const chasers = roster.filter((r) => r.team === 'chaser');
    const escapists = roster.filter((r) => r.team === 'escapist');

    const xs = g.chaserSpawns.length ? g.chaserSpawns : [g.passable[0]];
    const chaserTiles: number[] = [];
    chasers.forEach((r, i) => {
      const t = xs[i % xs.length];
      const c = g.tileCenter(t);
      const off = Math.floor(i / xs.length) * 6;
      chaserTiles.push(t);
      this.add(r, c.x + off, c.y);
    });

    // escapistas: lejos de los perseguidores, en zonas abiertas y separados entre sí
    const field = g.dijkstra(chaserTiles);
    const edge = (t: number) => Math.min(t % g.w, (t / g.w) | 0, g.w - 1 - (t % g.w), g.h - 1 - ((t / g.w) | 0));
    const shuffle = <T>(a: T[]) => {
      for (let i = a.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [a[i], a[j]] = [a[j], a[i]];
      }
      return a;
    };
    const candidates = shuffle(g.escapistSpawns.filter((t) => edge(t) >= 3 && g.openness[t] > 0.6));
    const far = shuffle(
      g.passable.filter(
        (t) => field.dist[t] > 16 && edge(t) >= 3 && g.openness[t] > 0.6 && g.terrain[t] !== Terrain.Quicksand && g.terrain[t] !== Terrain.Ice,
      ),
    );
    candidates.push(...far);
    const chosen: number[] = [];
    for (const t of candidates) {
      if (chosen.length >= escapists.length) break;
      const c = g.tileCenter(t);
      if (chosen.every((o) => {
        const oc = g.tileCenter(o);
        return Math.hypot(oc.x - c.x, oc.y - c.y) > TILE * 5;
      })) chosen.push(t);
    }
    while (chosen.length < escapists.length) chosen.push(far[chosen.length % Math.max(1, far.length)] ?? g.passable[0]);
    escapists.forEach((r, i) => {
      const c = g.tileCenter(chosen[i]);
      this.add(r, c.x, c.y);
    });
  }

  private add(r: RosterEntry, x: number, y: number): void {
    const c = new SimChar({ id: r.id, team: r.team, name: r.name, look: r.look, human: r.human, x, y });
    c.cos = r.cos ?? {};
    c.streak = r.streak ?? 0;
    this.chars.push(c);
    this.byId.set(c.id, c);
    if (!r.human) this.brains.set(c.id, new BotBrain(c, this));
  }

  // ------------------------------------------------------------------ control

  setHeld(id: number, h: HeldInput): void {
    const l = Math.hypot(h.mx, h.my);
    this.held.set(id, l > 1 ? { mx: h.mx / l, my: h.my / l, sprint: h.sprint } : h);
  }

  press(id: number, what: 'action' | 'special' | 'rotate' | 'spin'): void {
    const c = this.byId.get(id);
    if (!c) return;
    if (what === 'action') c.actionBuf = PRESS_BUFFER;
    else if (what === 'special') c.specialBuf = PRESS_BUFFER;
    else if (what === 'rotate') this.modeImpl.rotate(this, c);
    else this.hype.spin(id);
  }

  /** Pasa un personaje a control humano o a bot (p. ej. al desconectarse). */
  setHuman(id: number, human: boolean): void {
    const c = this.byId.get(id);
    if (!c) return;
    c.human = human;
    if (!human && !this.brains.has(id)) this.brains.set(id, new BotBrain(c, this));
    if (human) this.held.set(id, { mx: 0, my: 0, sprint: false });
  }

  /** Evento sin efectos secundarios (monedas, frases...). */
  pushEvent(e: SimEvent): void {
    this.events.push(e);
  }

  emit(e: SimEvent): void {
    this.events.push(e);
    if (e.t === 'hint') this.hints.push({ x: e.x, y: e.y, t: this.matchTime });
    this.autoSay(e);
    this.hype.onEvent(e);
    if ((e.t === 'trap' || e.t === 'infect' || (e.t === 'ko' && this.mode === 'escondite')) && e.a >= 0) {
      const s = this.streaks.get(e.a);
      const n = s && this.matchTime - s.t < CITY.streakWindow ? s.n + 1 : 1;
      this.streaks.set(e.a, { t: this.matchTime, n });
      if (n >= 2) this.events.push({ t: 'streak', id: e.a, n });
    }
  }

  /** Emote equipado (tecla G): se ve encima de la cabeza. */
  emote(id: number): boolean {
    const c = this.byId.get(id);
    const e = c?.cos.emote;
    if (!c || !e || c.emoteCd > 0) return false;
    c.emoteCd = 2;
    this.events.push({ t: 'emote', id, e });
    return true;
  }

  /** Un personaje dice una frase (bocadillo + voz en el cliente). */
  say(id: number, p: number): boolean {
    const c = this.byId.get(id);
    if (!c || p < 0 || p >= PHRASES.list.length || c.sayCd > 0) return false;
    c.sayCd = PHRASES.cooldown;
    this.events.push({ t: 'say', id, p });
    return true;
  }

  private sayMaybe(id: number, chance: number, options: readonly number[]): void {
    if (Math.random() < chance) this.say(id, options[Math.floor(Math.random() * options.length)]);
  }

  /** Frases automáticas según lo que pasa. */
  private autoSay(e: SimEvent): void {
    const ch = PHRASES.chance;
    if (e.t === 'hit') {
      this.sayMaybe(e.v, ch.hit, [4, 6, 21]);
      if (e.a >= 0) this.sayMaybe(e.a, ch.hit * 0.6, [2, 14, 15]);
    } else if (e.t === 'trap') {
      // el atrapado pide ayuda y el que pilla presume
      const v = this.byId.get(e.v);
      if (v) v.sayCd = 0;
      this.sayMaybe(e.v, ch.ko, [18, 4]);
      if (e.a >= 0) this.sayMaybe(e.a, ch.ko, [3, 17]);
    } else if (e.t === 'rescue') {
      const v = this.byId.get(e.v);
      if (v) v.sayCd = 0;
      this.sayMaybe(e.v, ch.rescue, [20, 10]);
    } else if (e.t === 'dodge') {
      this.sayMaybe(e.v, ch.dodge, [5, 21]);
    } else if (e.t === 'release') {
      for (const c of this.chars) if (c.isChaser) this.sayMaybe(c.id, ch.release, this.mode === 'infeccion' ? [23, 16] : [0, 1, 16]);
    } else if (e.t === 'infect') {
      const v = this.byId.get(e.v);
      if (v) v.sayCd = 0;
      this.sayMaybe(e.v, ch.ko * 0.7, [23, 4]);
    } else if (e.t === 'pass') {
      this.sayMaybe(e.from, ch.hit, [25, 11]);
    } else if (e.t === 'round') {
      for (const id of e.ids) this.sayMaybe(id, ch.ko, [26, 4]);
    } else if (e.t === 'seek') {
      for (const c of this.chars) if (c.isChaser) this.sayMaybe(c.id, ch.release, [27, 0, 16]);
    } else if (e.t === 'last') {
      this.sayMaybe(e.id, 1, [24]);
    }
    // Los bots también presumen con su emote.
    const who = e.t === 'trap' || e.t === 'infect' ? e.a : e.t === 'pass' ? e.from : -1;
    const b = who >= 0 ? this.byId.get(who) : undefined;
    if (b && !b.human && Math.random() < 0.3) this.emote(who);
  }

  /** Da monedas (con combo si encadenas acciones). */
  award(id: number, n: number, combo = true): number {
    return this.hype.award(id, n, combo);
  }

  medal(c: SimChar, m: string): void {
    this.hype.medal(c, m);
  }

  /** Datos del modo para el HUD (y la red). */
  modeNet(): ModeNet {
    const out = emptyModeNet();
    this.modeImpl.net(this, out);
    out.fx = this.hype.effect;
    out.ft = Math.max(0, Math.ceil(this.hype.effectLeft));
    return out;
  }

  /** Devuelve y vacía la lista de eventos pendientes. */
  drain(): SimEvent[] {
    const e = this.events;
    this.events = [];
    return e;
  }

  // ------------------------------------------------------------------ SimCtx / BotWorld

  canMove(c: { team: Team }): boolean {
    if (this.state !== 'play') return false;
    return canMoveFor(this.mode, c.team, this.matchTime, this.phase);
  }

  canMoveTeam(team: Team): boolean {
    return this.canMove({ team });
  }

  ability(c: Parameters<SimCtx['ability']>[0], slot: 'action' | 'special'): Ability {
    return abilityFor(this.mode, c, slot);
  }

  speedMul(c: Parameters<SimCtx['speedMul']>[0]): number {
    return speedMulFor(this.mode, c) * (this.hype.effect === 'turbo' ? HYPE.turboSpeed : 1);
  }

  useItem(id: number): void {
    const c = this.byId.get(id);
    if (c && c.alive) this.modeImpl.useItem(this, c);
  }

  disguise(id: number): void {
    const c = this.byId.get(id);
    if (c && c.alive) this.modeImpl.disguise(this, c);
  }

  downed(victimId: number, attackerId: number): void {
    const v = this.byId.get(victimId);
    if (v) this.modeImpl.onDowned(this, v, this.byId.get(attackerId) ?? null);
  }

  inSmoke(x: number, y: number): boolean {
    for (const s of this.smokes) if (s.contains(x, y)) return true;
    return false;
  }

  canSee(viewer: SimChar, target: SimChar): boolean {
    if (target.disguise >= 0 || target.invisible > 0) return false;
    if (this.mode === 'escondite' && viewer.isChaser && this.phase === 0) return false;
    const d = Math.hypot(target.x - viewer.x, target.y - viewer.y);
    if (target.inBush && d > BALANCE.terrain.bushRevealDistance && target.speedNow < 60) return false;
    if (this.inSmoke(target.x, target.y) && d > 18) return false;
    return true;
  }

  dangerField(): DistField {
    if (!this.danger || this.dangerTimer <= 0) {
      const g = this.grid;
      const src = this.chars.filter((c) => c.alive && this.isHunter(c)).map((c) => g.nearestWalkable(c.x, c.y));
      this.danger = g.dijkstra(src);
      this.dangerTimer = 0.25;
    }
    return this.danger;
  }

  meleeHit(attackerId: number): void {
    const a = this.byId.get(attackerId);
    if (!a) return;
    const C = BALANCE.chaser;
    const victims: SimChar[] = [];
    for (const c of this.chars) {
      if (!this.modeImpl.canHit(a, c)) continue;
      const dx = c.x - a.x;
      const dy = c.y - a.y;
      const d = Math.hypot(dx, dy);
      if (d > C.attackRange + c.radius) continue;
      const ang = Math.abs(wrapAngle(Math.atan2(dy, dx) - Math.atan2(a.fy, a.fx)));
      if (d > 7 && ang > C.attackArc) continue;
      if (!this.grid.lineOfSight(a.x, a.y, c.x, c.y)) continue;
      const nx = d > 0.01 ? dx / d : a.fx;
      const ny = d > 0.01 ? dy / d : a.fy;
      if (c.takeHit(this, this.modeImpl.meleeDamage(), a, nx, ny, C.attackKnockback) === 'hit') victims.push(c);
    }
    this.modeImpl.afterMelee(this, a, victims);
  }

  throwHam(attackerId: number, x: number, y: number, dx: number, dy: number): void {
    const p = new SimProjectile(this.nextPid++, attackerId, x, y, dx, dy);
    this.projectiles.push(p);
    this.emit({ t: 'throw', id: attackerId, pid: p.pid });
  }

  dropSmoke(x: number, y: number): void {
    const s = new SimSmoke(this.nextSid++, x, y);
    this.smokes.push(s);
    this.emit({ t: 'smoke', sid: s.sid, x, y });
  }

  // ------------------------------------------------------------------ bucle

  /** Vuelve la partida tras el Parón, con las ventajas de los ganadores. */
  resume(perks: Map<number, 'speed' | 'shield' | 'cooldown'>): void {
    this.frozen = false;
    for (const [id, perk] of perks) {
      const c = this.byId.get(id);
      if (!c || !c.alive) continue;
      c.perk = perk;
      if (perk === 'shield') c.shield = true;
    }
    this.events.push({ t: 'resume' });
  }

  step(dt: number): void {
    if (this.frozen) return;
    if (this.state === 'countdown') {
      const before = Math.ceil(this.countdown);
      this.countdown -= dt;
      const after = Math.ceil(this.countdown);
      if (after !== before && after > 0) this.emit({ t: 'countdown', n: after });
      if (this.countdown <= 0) {
        this.state = 'play';
        this.emit({ t: 'countdown', n: 0 });
      }
    }

    // ¡PARÓN! Una vez por partida, entre el 30% y el 70% del tiempo.
    if (this.state === 'play' && !this.paronDone && this.matchTime >= this.paronAt && this.chars.some((c) => c.human)) {
      this.paronDone = true;
      this.frozen = true;
      for (const c of this.chars) {
        c.vx = c.vy = c.kbx = c.kby = 0;
        c.dashTime = 0;
      }
      this.events.push({ t: 'paron' });
      return;
    }

    if (this.state === 'play') {
      this.matchTime += dt;
      this.timeLeft = Math.max(0, this.timeLeft - dt);
      if (!this.released && this.matchTime >= BALANCE.match.chaserReleaseDelay && (this.mode === 'pilla' || this.mode === 'infeccion')) {
        this.released = true;
        this.emit({ t: 'release' });
      }
      this.modeImpl.tick(this, dt);
      this.hype.tick(dt);
      this.updateItems(dt);
      this.updateBarriers(dt);
      this.updateCity(dt);
      this.hints = this.hints.filter((h) => this.matchTime - h.t < 8);
    }

    this.dangerTimer -= dt;
    for (const c of this.chars) {
      c.sayCd -= dt;
      c.emoteCd -= dt;
      const it = this.intentFor(c, dt);
      c.update(dt, this, it);
    }
    this.separate();
    this.updateProjectiles(dt);
    for (const s of this.smokes) {
      s.life -= dt;
      if (s.life <= 0) s.dead = true;
    }
    this.smokes = this.smokes.filter((s) => !s.dead);
    this.collectPickups();
    if (this.state === 'play') this.checkEnd();
  }

  private intentFor(c: SimChar, dt: number): Intent {
    const it = emptyIntent();
    if (c.human) {
      const h = this.held.get(c.id);
      if (h) {
        it.mx = h.mx;
        it.my = h.my;
        it.sprint = h.sprint;
      }
      it.action = c.actionBuf > 0;
      it.special = c.specialBuf > 0;
    } else {
      const brain = this.brains.get(c.id);
      if (brain) {
        brain.update(dt, it);
        // los bots perseguidores animan la caza de vez en cuando
        if (c.alive && c.isChaser && brain.mode === 'chase' && c.sayCd <= 0 && Math.random() < PHRASES.chance.chase * dt) this.say(c.id, Math.random() < 0.5 ? 0 : 1);
      }
    }
    return it;
  }

  private separate(): void {
    const cs = this.chars;
    for (let i = 0; i < cs.length; i++) {
      const a = cs[i];
      if (!a.alive) continue;
      for (let j = i + 1; j < cs.length; j++) {
        const b = cs[j];
        if (!b.alive) continue;
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const min = a.radius + b.radius;
        const d2 = dx * dx + dy * dy;
        if (d2 >= min * min) continue;
        const d = Math.sqrt(d2) || 0.01;
        const push = (min - d) / 2;
        const nx = d2 > 0 ? dx / d : 1;
        const ny = d2 > 0 ? dy / d : 0;
        a.x -= nx * push;
        a.y -= ny * push;
        b.x += nx * push;
        b.y += ny * push;
        resolveCircle(this.grid, a, a.radius);
        resolveCircle(this.grid, b, b.radius);
      }
    }
  }

  private updateProjectiles(dt: number): void {
    const C = BALANCE.chaser;
    for (const p of this.projectiles) {
      if (p.dead) continue;
      const step = C.throwSpeed * dt;
      const n = Math.ceil(step / 3);
      for (let i = 0; i < n && !p.dead; i++) {
        p.x += (p.dx * step) / n;
        p.y += (p.dy * step) / n;
        p.travelled += step / n;
        const ch = this.grid.charAt(Math.floor(p.x / TILE), Math.floor(p.y / TILE));
        if (SHOT_BLOCKERS.includes(ch)) {
          this.endProjectile(p, true);
          break;
        }
        const owner = this.byId.get(p.owner) ?? null;
        for (const c of this.chars) {
          if (!owner || !this.modeImpl.canHit(owner, c)) continue;
          if (Math.hypot(c.x - p.x, c.y - p.y) < c.radius + 5) {
            const r = c.takeHit(this, C.throwDamage, owner, p.dx, p.dy, C.throwKnockback);
            if (r === 'hit') owner.stats.throwsHit++;
            if (r !== 'none') {
              this.endProjectile(p, false);
              break;
            }
          }
        }
        if (!p.dead && p.travelled >= C.throwRange) this.endProjectile(p, true);
      }
    }
    this.projectiles = this.projectiles.filter((p) => !p.dead);
  }

  private endProjectile(p: SimProjectile, thud: boolean): void {
    p.dead = true;
    this.emit({ t: 'projEnd', pid: p.pid, x: p.x, y: p.y, thud });
  }

  private updateItems(dt: number): void {
    for (const p of this.pickups) {
      p.life -= dt;
      if (p.life <= 0) p.dead = true;
    }
    this.pickups = this.pickups.filter((p) => !p.dead);
    const weights = this.modeImpl.itemWeights;
    if (!weights) return;
    this.itemTimer -= dt;
    if (this.itemTimer > 0) return;
    this.itemTimer = BALANCE.items.spawnInterval * (0.8 + Math.random() * 0.4);
    // En mapas grandes caben más objetos.
    const max = BALANCE.items.maxOnMap * this.scale.sx * this.scale.sy;
    if (this.pickups.filter((p) => p.type !== 'coin').length >= max) return;
    const g = this.grid;
    const used = new Set(this.pickups.map((p) => p.spawnIndex));
    const free = g.itemSpawns.filter((t) => !used.has(t));
    if (!free.length) return;
    const t = free[Math.floor(Math.random() * free.length)];
    const entries = Object.entries(weights) as [PickupType, number][];
    let r = Math.random() * entries.reduce((a, [, w]) => a + w, 0);
    let type = entries[entries.length - 1][0];
    for (const [k, w] of entries) {
      if ((r -= w) < 0) {
        type = k;
        break;
      }
    }
    this.spawnPickup(type, t);
  }

  private spawnPickup(type: PickupType, t: number): void {
    const c = this.grid.tileCenter(t);
    const p = new SimPickup(this.nextIid++, type, c.x, c.y, t);
    if (type === 'coin') p.life = HYPE.effectSeconds + 5;
    this.pickups.push(p);
    this.emit({ t: 'itemSpawn', iid: p.iid, type, x: c.x, y: c.y });
  }

  /** Ruleta: lluvia de monedas por todo el mapa. */
  coinRain(n: number): void {
    const g = this.grid;
    const used = new Set(this.pickups.map((p) => p.spawnIndex));
    // Cerca de los jugadores vivos, para que se note.
    const alive = this.chars.filter((c) => c.alive);
    for (let k = 0; k < n * 3 && n > 0; k++) {
      const who = alive[Math.floor(Math.random() * alive.length)];
      if (!who) break;
      const tx = Math.floor(who.x / TILE) + Math.floor(Math.random() * 13) - 6;
      const ty = Math.floor(who.y / TILE) + Math.floor(Math.random() * 9) - 4;
      if (!g.walkable(tx, ty)) continue;
      const t = g.idx(tx, ty);
      if (used.has(t) || g.terrain[t] === Terrain.Water) continue;
      used.add(t);
      this.spawnPickup('coin', t);
      n--;
    }
  }

  /** Ruleta: cambiazo, todos intercambian posiciones. */
  shufflePositions(): void {
    const cs = this.chars.filter((c) => c.alive && c.trapped <= 0);
    const pos = cs.map((c) => ({ x: c.x, y: c.y }));
    for (let i = pos.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [pos[i], pos[j]] = [pos[j], pos[i]];
    }
    cs.forEach((c, i) => {
      const x0 = c.x;
      const y0 = c.y;
      c.x = pos[i].x;
      c.y = pos[i].y;
      c.vx = c.vy = c.kbx = c.kby = 0;
      c.invuln = Math.max(c.invuln, 1);
      this.pushEvent({ t: 'metro', id: c.id, x0: Math.round(x0), y0: Math.round(y0), x1: Math.round(c.x), y1: Math.round(c.y) });
    });
  }

  /** Barrera temporal (Infección). */
  barrier(tiles: number[], seconds: number): void {
    const done = this.grid.setBarrier(tiles, true);
    if (!done.length) return;
    this.barriers.push({ tiles: done, t: seconds });
    this.danger = null;
    this.emit({ t: 'barrier', tiles: done, on: true });
  }

  private updateBarriers(dt: number): void {
    for (const b of this.barriers) {
      b.t -= dt;
      if (b.t <= 0) {
        this.grid.setBarrier(b.tiles, false);
        this.emit({ t: 'barrier', tiles: b.tiles, on: false });
      }
    }
    this.barriers = this.barriers.filter((b) => b.t > 0);
  }

  private collectPickups(): void {
    for (const p of this.pickups) {
      if (p.dead) continue;
      for (const c of this.chars) {
        if (!c.free || Math.hypot(c.x - p.x, c.y - p.y) > 11) continue;
        if (p.type !== 'coin') {
          if (!this.modeImpl.canPickup(c, p.type)) continue;
          this.modeImpl.onPickup(this, c, p.type);
          c.stats.items++;
        }
        p.dead = true;
        this.emit({ t: 'pickup', iid: p.iid, id: c.id, type: p.type, x: p.x, y: p.y });
        break;
      }
    }
    this.pickups = this.pickups.filter((p) => !p.dead);
  }

  /** Mecánicas de las ciudades: metro (París) y levante (Ceuta). */
  private updateCity(dt: number): void {
    const g = this.grid;
    if (g.metroTiles.length > 1) {
      for (const c of this.chars) {
        c.metroCd -= dt;
        // Solo las personas usan el metro (es un truco del jugador; los bots lo pisarían sin querer).
        if (!c.human || !c.free || c.metroCd > 0 || g.terrainAt(c.x, c.y) !== Terrain.Metro) continue;
        const here = g.tileOf(c.x, c.y);
        const i = g.metroTiles.indexOf(here);
        const dest = g.metroTiles[(i + 1) % g.metroTiles.length];
        const p = g.tileCenter(dest);
        const x0 = c.x;
        const y0 = c.y;
        c.x = p.x;
        c.y = p.y + 2;
        c.metroCd = CITY.metroCooldown;
        this.emit({ t: 'metro', id: c.id, x0: Math.round(x0), y0: Math.round(y0), x1: Math.round(c.x), y1: Math.round(c.y) });
      }
    }
    if (this.mapId === 'ceuta') {
      const L = CITY.levante;
      this.windTimer -= dt;
      if (!this.windOn && this.windTimer <= 0) {
        this.windOn = true;
        this.windTimer = L.duration;
        this.windDir = Math.random() < 0.8 ? -1 : 1; // el levante sopla hacia el oeste
        this.emit({ t: 'wind', on: true, dx: this.windDir });
      } else if (this.windOn && this.windTimer <= 0) {
        this.windOn = false;
        this.windTimer = L.interval;
        this.emit({ t: 'wind', on: false, dx: 0 });
      }
      const target = this.windOn ? this.windDir * L.force : 0;
      this.wind.x += (target - this.wind.x) * Math.min(1, dt * 2);
      this.wind.y = this.windOn ? Math.sin(this.matchTime * 3) * 6 : 0;
    }
  }

  private checkEnd(): void {
    this.modeImpl.checkEnd(this);
  }

  end(winner: Team, champion = -1): void {
    if (this.state === 'ended') return;
    this.state = 'ended';
    this.winner = winner;
    this.champion = champion;
    this.hype.finish(winner);
    this.emit({ t: 'end', winner, ch: champion });
  }
}
