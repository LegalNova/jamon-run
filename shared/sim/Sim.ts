import { AIParams, BALANCE, Difficulty, PHRASES, TILE } from '../balance';
import { resolveCircle } from '../collision';
import { DistField, Grid, Terrain } from '../grid';
import { BiomeId } from '../maps';
import { buildRows, MapScale } from '../mapScale';
import { BotBrain, BotWorld } from './Bot';
import { SimChar, wrapAngle, PRESS_BUFFER } from './Char';
import { emptyIntent, HeldInput, Intent, MatchState, PickupType, RosterEntry, SimCtx, SimEvent, Team } from './types';

const BLOCKERS = '#TRHnr';

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
  mapId: BiomeId;
  scale: MapScale;
  duration: number;
  difficulty: Difficulty;
  roster: RosterEntry[];
}

/**
 * La partida completa, sin gráficos: reglas, personajes, IA, objetos y proyectiles.
 * La ejecutan el navegador (modo offline) y el servidor (modo online).
 */
export class Sim implements SimCtx, BotWorld {
  readonly grid: Grid;
  readonly mapId: BiomeId;
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

  constructor(o: SimOptions) {
    this.mapId = o.mapId;
    this.scale = o.scale;
    this.grid = new Grid(buildRows(o.mapId, o.scale));
    this.ai = BALANCE.ai[o.difficulty];
    this.duration = o.duration;
    this.timeLeft = o.duration;
    this.spawn(o.roster);
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
    this.chars.push(c);
    this.byId.set(c.id, c);
    if (!r.human) this.brains.set(c.id, new BotBrain(c, this));
  }

  // ------------------------------------------------------------------ control

  setHeld(id: number, h: HeldInput): void {
    const l = Math.hypot(h.mx, h.my);
    this.held.set(id, l > 1 ? { mx: h.mx / l, my: h.my / l, sprint: h.sprint } : h);
  }

  press(id: number, what: 'action' | 'special'): void {
    const c = this.byId.get(id);
    if (!c) return;
    if (what === 'action') c.actionBuf = PRESS_BUFFER;
    else c.specialBuf = PRESS_BUFFER;
  }

  /** Pasa un personaje a control humano o a bot (p. ej. al desconectarse). */
  setHuman(id: number, human: boolean): void {
    const c = this.byId.get(id);
    if (!c) return;
    c.human = human;
    if (!human && !this.brains.has(id)) this.brains.set(id, new BotBrain(c, this));
    if (human) this.held.set(id, { mx: 0, my: 0, sprint: false });
  }

  emit(e: SimEvent): void {
    this.events.push(e);
    this.autoSay(e);
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
      this.sayMaybe(e.v, ch.hit, [4, 6]);
      if (e.a >= 0) this.sayMaybe(e.a, ch.hit * 0.6, [2]);
    } else if (e.t === 'ko' && e.a >= 0) {
      this.sayMaybe(e.a, ch.ko, [3]);
    } else if (e.t === 'dodge') {
      this.sayMaybe(e.v, ch.dodge, [5]);
    } else if (e.t === 'release') {
      for (const c of this.chars) if (c.isChaser) this.sayMaybe(c.id, ch.release, [0, 1]);
    }
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
    if (c.team === 'chaser' && this.matchTime < BALANCE.match.chaserReleaseDelay) return false;
    return true;
  }

  inSmoke(x: number, y: number): boolean {
    for (const s of this.smokes) if (s.contains(x, y)) return true;
    return false;
  }

  canSee(viewer: SimChar, target: SimChar): boolean {
    const d = Math.hypot(target.x - viewer.x, target.y - viewer.y);
    if (target.inBush && d > BALANCE.terrain.bushRevealDistance && target.speedNow < 60) return false;
    if (this.inSmoke(target.x, target.y) && d > 18) return false;
    return true;
  }

  dangerField(): DistField {
    if (!this.danger || this.dangerTimer <= 0) {
      const g = this.grid;
      const src = this.chars.filter((c) => c.alive && c.isChaser).map((c) => g.nearestWalkable(c.x, c.y));
      this.danger = g.dijkstra(src);
      this.dangerTimer = 0.25;
    }
    return this.danger;
  }

  meleeHit(attackerId: number): void {
    const a = this.byId.get(attackerId);
    if (!a) return;
    const C = BALANCE.chaser;
    for (const c of this.chars) {
      if (!c.alive || c.isChaser) continue;
      const dx = c.x - a.x;
      const dy = c.y - a.y;
      const d = Math.hypot(dx, dy);
      if (d > C.attackRange + c.radius) continue;
      const ang = Math.abs(wrapAngle(Math.atan2(dy, dx) - Math.atan2(a.fy, a.fx)));
      if (d > 7 && ang > C.attackArc) continue;
      if (!this.grid.lineOfSight(a.x, a.y, c.x, c.y)) continue;
      const nx = d > 0.01 ? dx / d : a.fx;
      const ny = d > 0.01 ? dy / d : a.fy;
      c.takeHit(this, C.attackDamage, a, nx, ny, C.attackKnockback);
    }
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

  step(dt: number): void {
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

    if (this.state === 'play') {
      this.matchTime += dt;
      this.timeLeft = Math.max(0, this.timeLeft - dt);
      if (!this.released && this.matchTime >= BALANCE.match.chaserReleaseDelay) {
        this.released = true;
        this.emit({ t: 'release' });
      }
      for (const c of this.chars) if (c.alive && !c.isChaser) c.stats.timeSurvived += dt;
      this.updateItems(dt);
    }

    this.dangerTimer -= dt;
    for (const c of this.chars) {
      c.sayCd -= dt;
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
        if (BLOCKERS.includes(ch)) {
          this.endProjectile(p, true);
          break;
        }
        for (const c of this.chars) {
          if (!c.alive || c.isChaser) continue;
          if (Math.hypot(c.x - p.x, c.y - p.y) < c.radius + 5) {
            const owner = this.byId.get(p.owner) ?? null;
            const r = c.takeHit(this, C.throwDamage, owner, p.dx, p.dy, C.throwKnockback);
            if (r === 'hit' && owner) owner.stats.throwsHit++;
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
    this.itemTimer -= dt;
    if (this.itemTimer > 0) return;
    this.itemTimer = BALANCE.items.spawnInterval * (0.8 + Math.random() * 0.4);
    // En mapas grandes caben más objetos.
    const max = BALANCE.items.maxOnMap * this.scale.sx * this.scale.sy;
    if (this.pickups.length >= max) return;
    const g = this.grid;
    const used = new Set(this.pickups.map((p) => p.spawnIndex));
    const free = g.itemSpawns.filter((t) => !used.has(t));
    if (!free.length) return;
    const t = free[Math.floor(Math.random() * free.length)];
    const w = BALANCE.items.weights;
    let r = Math.random() * (w.medkit + w.boot + w.shield);
    let type: PickupType = 'shield';
    if ((r -= w.medkit) < 0) type = 'medkit';
    else if ((r -= w.boot) < 0) type = 'boot';
    const c = g.tileCenter(t);
    const p = new SimPickup(this.nextIid++, type, c.x, c.y, t);
    this.pickups.push(p);
    this.emit({ t: 'itemSpawn', iid: p.iid, type, x: c.x, y: c.y });
  }

  private collectPickups(): void {
    for (const p of this.pickups) {
      if (p.dead) continue;
      for (const c of this.chars) {
        if (!c.alive || Math.hypot(c.x - p.x, c.y - p.y) > 11) continue;
        if (p.type === 'medkit' && (c.isChaser || c.hp >= c.maxHp)) continue;
        if (p.type === 'shield' && (c.isChaser || c.shield)) continue;
        if (p.type === 'medkit') c.heal(BALANCE.items.medkitHeal);
        else if (p.type === 'boot') c.bootTime = BALANCE.items.bootDuration;
        else c.shield = true;
        c.stats.items++;
        p.dead = true;
        this.emit({ t: 'pickup', iid: p.iid, id: c.id, type: p.type, x: p.x, y: p.y });
        break;
      }
    }
    this.pickups = this.pickups.filter((p) => !p.dead);
  }

  private checkEnd(): void {
    const aliveEsc = this.chars.some((c) => c.alive && !c.isChaser);
    if (!aliveEsc) this.end('chaser');
    else if (this.timeLeft <= 0) this.end('escapist');
  }

  private end(winner: Team): void {
    this.state = 'ended';
    this.winner = winner;
    this.emit({ t: 'end', winner });
  }
}
