import { BALANCE, HYPE, NET } from '../../shared/balance';
import { resolveCircle } from '../../shared/collision';
import { Grid } from '../../shared/grid';
import type { MapId } from '../../shared/maps';
import { buildRows, MapScale } from '../../shared/mapScale';
import { abilityFor, canMoveFor, speedMulFor } from '../../shared/modes/rules';
import { emptyModeNet, ModeNet } from '../../shared/modes/types';
import type { MgKey, ParonNet } from '../../shared/minigames';
import { buildProps, Prop } from '../../shared/props';
import { F, F2, MeNet, PICKUPS, ResultNet, ServerMsg, SnapshotNet, STATES } from '../../shared/protocol';
import { PRESS_BUFFER, SimChar } from '../../shared/sim/Char';
import { emptyIntent, HeldInput, MatchState, ModeId, SimCtx, SimEvent, Team } from '../../shared/sim/types';
import type { GameModel, PickupLike, ProjectileLike, SmokeLike } from '../game/model';
import { net } from './NetClient';

type StartMsg = Extract<ServerMsg, { t: 'start' }>;

interface Snap {
  ts: number;
  st: MatchState;
  tl: number;
  mt: number;
  c: Map<number, number[]>;
  p: number[][];
  j: number[][];
  k: number[][];
  w: [number, number];
  ms: ModeNet;
}

const INPUT_INTERVAL = 1000 / NET.inputRate;

/**
 * Partida online vista desde el cliente:
 *  - tu personaje se predice con la misma simulación (respuesta inmediata)
 *    y se corrige suavemente con lo que dice el servidor;
 *  - los demás se interpolan entre snapshots, ~110 ms en el pasado.
 */
export class OnlineModel implements GameModel {
  readonly online = true;
  readonly mode: ModeId;
  readonly props: Prop[];
  readonly mapId: MapId;
  champion = -1;
  private ms: ModeNet = emptyModeNet();
  readonly scale: MapScale;
  readonly grid: Grid;
  readonly duration: number;
  readonly playerId: number;
  readonly chars: SimChar[] = [];
  pickups: PickupLike[] = [];
  projectiles: ProjectileLike[] = [];
  smokes: SmokeLike[] = [];
  state: MatchState = 'countdown';
  timeLeft: number;
  matchTime = 0;
  winner: Team | null = null;
  results: { mode: ModeId; winner: Team; champion: number; timePlayed: number; duration: number; entries: ResultNet[] } | null = null;
  readonly roster: StartMsg['roster'];

  private byId = new Map<number, SimChar>();
  private me: SimChar;
  private snaps: Snap[] = [];
  private pending: { ts: number; e: SimEvent }[] = [];
  private history: { t: number; x: number; y: number }[] = [];
  private held: HeldInput = { mx: 0, my: 0, sprint: false };
  private aCount = 0;
  private bCount = 0;
  private oCount = 0;
  private qCount = 0;
  private lastSent = { x: 0, y: 0, r: 0, a: 0, b: 0, o: 0, q: 0 };
  private lastSendAt = 0;
  private unsub: () => void;
  private ctx: SimCtx;
  /** (hora del snapshot - hora local de llegada), suavizado: sirve de reloj para interpolar. */
  private snapOffset = 0;
  private haveSnap = false;

  constructor(start: StartMsg) {
    this.mode = start.mode ?? 'pilla';
    this.mapId = start.mapId;
    this.scale = start.scale;
    this.duration = start.duration;
    this.timeLeft = start.duration;
    this.playerId = start.you;
    this.roster = start.roster;
    this.grid = new Grid(buildRows(start.mapId, start.scale));
    this.props = this.mode === 'escondite' ? buildProps(this.grid, start.seed) : [];
    for (const r of start.roster) {
      const c = new SimChar({ id: r.id, team: r.team, name: r.name, look: r.look, human: r.human, x: 0, y: 0 });
      c.cos = r.cos ?? {};
      c.streak = r.streak ?? 0;
      c.spinsLeft = HYPE.personalSpins;
      this.chars.push(c);
      this.byId.set(c.id, c);
    }
    this.me = this.byId.get(start.you)!;
    this.me.human = true;
    this.ctx = {
      grid: this.grid,
      ai: BALANCE.ai.normal,
      matchTime: 0,
      mode: this.mode,
      canMove: (c) => this.state === 'play' && canMoveFor(this.mode, c.team, this.matchTime, this.ms.ph),
      ability: (c, slot) => abilityFor(this.mode, c, slot),
      speedMul: (c) => speedMulFor(this.mode, c) * (this.ms.fx === 'turbo' ? HYPE.turboSpeed : 1),
      useItem: () => undefined,
      disguise: () => undefined,
      downed: () => undefined,
      inSmoke: (x, y) => this.smokes.some((s) => (x - s.x) ** 2 + ((y - s.y) * 1.2) ** 2 < s.radius * s.radius),
      wind: { x: 0, y: 0 },
      emit: (e) => this.localEvents.push(e),
      meleeHit: () => undefined,
      throwHam: () => undefined,
      dropSmoke: () => undefined,
    };
    this.unsub = net.on((msg) => this.onMsg(msg));
  }

  private localEvents: SimEvent[] = [];
  private pnet: ParonNet | null = null;
  /** Resultado del último Parón (para la pantalla final). */
  lastParon: { mg: string; res: { id: number; place: number; label: string; won: boolean }[] } | null = null;
  private pnetAt = 0;
  private reactions: { id: number; e: number }[] = [];

  paron(): ParonNet | null {
    return this.pnet;
  }

  /** Tiempo del minijuego: el último del servidor + lo que ha pasado desde que llegó. */
  paronT(): number {
    const t = (this.pnet?.st?.t as number | undefined) ?? 0;
    if (this.pnet?.ph !== 'play') return t;
    return t + (performance.now() - this.pnetAt) / 1000;
  }

  mgInput(k: MgKey): void {
    net.sendMsg({ t: 'mi', k, p: Math.round(net.ping) });
  }

  react(e: number): void {
    net.sendMsg({ t: 're', e });
  }

  rouletteBet(c: string, a: number): void {
    net.sendMsg({ t: 'rb', c, a });
  }

  drainReactions(): { id: number; e: number }[] {
    const r = this.reactions;
    this.reactions = [];
    return r;
  }

  get ping(): number {
    return net.ping;
  }

  player(): SimChar {
    return this.me;
  }

  modeNet(): ModeNet {
    return this.ms;
  }

  // ------------------------------------------------------------------ red

  private onMsg(msg: ServerMsg): void {
    if (msg.t === 's') this.onSnapshot(msg.s, msg.m);
    else if (msg.t === 'mg') {
      if (msg.p.res) this.lastParon = { mg: msg.p.mg, res: msg.p.res };
      this.pnet = msg.p.ph === 'end' ? null : msg.p;
      this.pnetAt = performance.now();
    } else if (msg.t === 're') this.reactions.push({ id: msg.id, e: msg.e });
    else if (msg.t === 'start') net.takePendingStart(); // reconexión: seguimos en esta misma partida
    else if (msg.t === 'results')
      this.results = { mode: msg.mode, winner: msg.winner, champion: msg.champion, timePlayed: msg.timePlayed, duration: msg.duration, entries: msg.entries };
  }

  private onSnapshot(s: SnapshotNet, m?: MeNet): void {
    net.hintServerTime(s.ts);
    const sample = s.ts - performance.now();
    if (!this.haveSnap) {
      this.snapOffset = sample;
      this.haveSnap = true;
    } else {
      // Se adapta despacio (el jitter no mueve el reloj) salvo saltos grandes.
      const d = sample - this.snapOffset;
      this.snapOffset += Math.abs(d) > 250 ? d : d * 0.05;
    }
    const c = new Map<number, number[]>();
    for (const e of s.c) c.set(e[0], e);
    const snap: Snap = { ts: s.ts, st: STATES[s.st] ?? 'play', tl: s.tl / 10, mt: s.mt / 10, c, p: s.p, j: s.j, k: s.k, w: s.w ?? [0, 0], ms: s.ms ?? emptyModeNet() };
    // Las barreras cambian el mapa ya (para que la predicción no las atraviese).
    for (const e of s.e) if (e.t === 'barrier') this.grid.setBarrier(e.tiles, e.on);
    this.ms = snap.ms;
    // el viento lo aplicamos ya a la predicción
    this.ctx.wind.x = snap.w[0] / 10;
    this.ctx.wind.y = snap.w[1] / 10;
    this.snaps.push(snap);
    while (this.snaps.length > 40) this.snaps.shift();
    for (const e of s.e) this.pending.push({ ts: s.ts, e });

    // --- tu personaje: estado del servidor + corrección de la predicción
    const mine = c.get(this.playerId);
    if (mine) this.reconcile(mine, s.ts, m);
  }

  /** Campos de los modos (equipo, disfraz, jamón bomba...). */
  private applyModeFields(c: SimChar, e: number[]): void {
    if (e[12] === undefined) return;
    const team: Team = e[12] === 1 ? 'chaser' : 'escapist';
    c.team = team;
    c.disguise = e[13];
    c.rot = e[14];
    const f2 = e[15];
    c.bomb = (f2 & F2.bomb) !== 0;
    c.anchored = (f2 & F2.anchored) !== 0;
    c.invisible = f2 & F2.invisible ? 0.2 : 0;
    c.heldItem = f2 & F2.barrier ? 'barrier' : f2 & F2.grenade ? 'grenade' : null;
    c.dashFree = f2 & F2.dashFree ? 0.2 : 0;
    c.perk = f2 & F2.perkSpeed ? 'speed' : f2 & F2.perkCd ? 'cooldown' : c.perk === 'shield' ? 'shield' : null;
  }

  private reconcile(e: number[], ts: number, m?: MeNet): void {
    const me = this.me;
    const flags = e[9];
    this.applyModeFields(me, e);
    const wasAlive = me.alive;
    me.alive = (flags & F.alive) !== 0;
    me.hp = e[7];
    me.shield = (flags & F.shield) !== 0;
    me.stun = flags & F.stun ? Math.max(me.stun, 0.05) : Math.min(me.stun, 0);
    me.invuln = flags & F.invuln ? Math.max(me.invuln, 0.05) : 0;
    me.trapped = e[10] !== undefined ? e[10] / 10 : 0;
    me.rescueProg = e[11] !== undefined ? e[11] / 100 : 0;
    if (wasAlive && !me.alive) this.history = [];
    if (m) {
      // Cooldowns: confiamos en la predicción salvo que se aleje mucho.
      if (Math.abs(me.attackCd - m.ac) > 0.25) me.attackCd = m.ac;
      if (Math.abs(me.dashCd - m.dc) > 0.25) me.dashCd = m.dc;
      if (Math.abs(me.specialCd - m.sc) > 0.25) me.specialCd = m.sc;
      if (Math.abs(me.energy - m.en) > 10) me.energy = m.en;
      me.exhaustTimer = m.ex;
      me.bootTime = m.bt;
      me.stats.eliminations = m.el;
      if (m.sp !== undefined) me.spinsLeft = m.sp;
      if (Math.abs(me.straightTime - m.st) > 0.4) me.straightTime = m.st;
    }

    // ¿Dónde estaba yo (según mi predicción) cuando el servidor calculó esto?
    const sx = e[1] / 10;
    const sy = e[2] / 10;
    const oneWay = Math.min(250, (net.ping || 100) / 2);
    const tLocal = ts - (net.serverNow() - performance.now()) - oneWay;
    const past = this.historyAt(tLocal);
    if (!past) {
      me.x = sx;
      me.y = sy;
      return;
    }
    const ex = sx - past.x;
    const ey = sy - past.y;
    const err = Math.hypot(ex, ey);
    if (err > 40) {
      // Demasiado lejos (p. ej. un empujón fuerte): saltamos a la posición buena.
      me.x += ex;
      me.y += ey;
      me.kbx = 0;
      me.kby = 0;
      for (const h of this.history) {
        h.x += ex;
        h.y += ey;
      }
    } else if (err > 1.2) {
      const k = 0.3;
      me.x += ex * k;
      me.y += ey * k;
      for (const h of this.history) {
        if (h.t >= tLocal) {
          h.x += ex * k;
          h.y += ey * k;
        }
      }
    }
    resolveCircle(this.grid, me, me.radius);
  }

  private historyAt(t: number): { x: number; y: number } | null {
    const h = this.history;
    if (h.length < 2 || t < h[0].t) return null;
    for (let i = h.length - 1; i > 0; i--) {
      if (h[i - 1].t <= t) {
        const a = h[i - 1];
        const b = h[i];
        const k = b.t > a.t ? Math.min(1, (t - a.t) / (b.t - a.t)) : 0;
        return { x: a.x + (b.x - a.x) * k, y: a.y + (b.y - a.y) * k };
      }
    }
    return null;
  }

  // ------------------------------------------------------------------ bucle

  update(dt: number): SimEvent[] {
    const out: SimEvent[] = [];
    // Dibujamos a los demás un poco en el pasado respecto al último snapshot recibido.
    const renderT = performance.now() + this.snapOffset - NET.interpolationDelayMs;
    this.interpolate(renderT);
    this.predict(dt, out);
    // eventos del servidor cuando les toca (sincronizados con lo que se dibuja)
    while (this.pending.length && this.pending[0].ts <= renderT + 30) {
      const { e } = this.pending.shift()!;
      // tu golpe y tu dash ya se mostraron al predecirlos
      if ((e.t === 'swing' || e.t === 'dash') && e.id === this.playerId) continue;
      if (e.t === 'end') {
        this.winner = e.winner;
        this.champion = e.ch ?? -1;
      }
      out.push(e);
    }
    this.sendInput();
    return out;
  }

  private predict(dt: number, out: SimEvent[]): void {
    const me = this.me;
    // Durante el Parón la partida está congelada: no se predice nada.
    if (!this.snaps.length || this.pnet) return;
    this.ctx.matchTime = this.matchTime;
    const it = emptyIntent();
    it.mx = this.held.mx;
    it.my = this.held.my;
    it.sprint = this.held.sprint;
    it.action = me.actionBuf > 0;
    it.special = me.specialBuf > 0;
    this.localEvents = [];
    me.update(dt, this.ctx, it);
    for (const e of this.localEvents) if (e.t === 'swing' || e.t === 'dash') out.push(e);
    const now = performance.now();
    this.history.push({ t: now, x: me.x, y: me.y });
    while (this.history.length && now - this.history[0].t > 1500) this.history.shift();
  }

  private interpolate(renderT: number): void {
    const snaps = this.snaps;
    if (!snaps.length) return;
    let a = snaps[0];
    let b = snaps[0];
    for (let i = snaps.length - 1; i >= 0; i--) {
      if (snaps[i].ts <= renderT) {
        a = snaps[i];
        b = snaps[Math.min(i + 1, snaps.length - 1)];
        break;
      }
    }
    const span = b.ts - a.ts;
    let k = span > 0 ? (renderT - a.ts) / span : 0;
    // Si vamos por delante del último snapshot, extrapolamos un poco (máx. 100 ms).
    let extra = 0;
    if (a === b) {
      extra = Math.min(0.1, Math.max(0, (renderT - a.ts) / 1000));
      k = 0;
    }
    k = Math.max(0, Math.min(1, k));

    this.state = a.st;
    this.timeLeft = a.tl + (b.tl - a.tl) * k;
    this.matchTime = a.mt + (b.mt - a.mt) * k;

    for (const c of this.chars) {
      if (c === this.me) continue;
      const ea = a.c.get(c.id);
      const eb = b.c.get(c.id) ?? ea;
      if (!ea || !eb) continue;
      const lerp = (i: number) => ea[i] + (eb[i] - ea[i]) * k;
      c.x = lerp(1) / 10 + (extra ? (eb[3] * extra) : 0);
      c.y = lerp(2) / 10 + (extra ? (eb[4] * extra) : 0);
      c.vx = eb[3];
      c.vy = eb[4];
      const fx = eb[5] / 100;
      const fy = eb[6] / 100;
      if (fx || fy) {
        c.fx = fx;
        c.fy = fy;
      }
      c.hp = eb[7];
      c.energy = eb[8];
      const f = eb[9];
      c.alive = (f & F.alive) !== 0;
      c.inBush = (f & F.bush) !== 0;
      c.shield = (f & F.shield) !== 0;
      c.bootTime = f & F.boot ? 1 : 0;
      c.dashTime = f & F.dash ? 0.1 : 0;
      c.invuln = f & F.invuln ? 0.1 : 0;
      c.sprinting = (f & F.sprint) !== 0;
      c.stun = f & F.stun ? 0.1 : 0;
      c.hamHidden = f & F.hamHidden ? 0.1 : 0;
      c.human = (f & F.human) !== 0;
      c.trapped = (eb[10] ?? 0) / 10;
      c.rescueProg = (eb[11] ?? 0) / 100;
      this.applyModeFields(c, eb);
      c.intent.mx = Math.sign(c.vx);
    }
    // primera colocación de tu personaje
    if (this.history.length === 0 && this.me.x === 0 && this.me.y === 0) {
      const e = a.c.get(this.playerId);
      if (e) {
        this.me.x = e[1] / 10;
        this.me.y = e[2] / 10;
      }
    }

    this.pickups = b.p.map((p) => ({ iid: p[0], type: PICKUPS[p[1]], x: p[2], y: p[3], life: p[4], dead: false }));
    const jb = new Map(b.j.map((p) => [p[0], p]));
    this.projectiles = a.j.map((p) => {
      const q = jb.get(p[0]) ?? p;
      return { pid: p[0], x: p[1] + (q[1] - p[1]) * k, y: p[2] + (q[2] - p[2]) * k, dx: p[3] / 100, dy: p[4] / 100, travelled: p[5] + (q[5] - p[5]) * k };
    });
    this.smokes = b.k.map((s) => ({ sid: s[0], x: s[1], y: s[2], life: s[3] / 10, radius: BALANCE.escapist.smokeRadius }));
  }

  // ------------------------------------------------------------------ entrada

  setHeld(h: HeldInput): void {
    this.held = h;
  }

  press(what: 'action' | 'special' | 'rotate' | 'spin'): void {
    if (what === 'action') {
      this.aCount++;
      this.me.actionBuf = PRESS_BUFFER;
    } else if (what === 'special') {
      this.bCount++;
      this.me.specialBuf = PRESS_BUFFER;
    } else if (what === 'rotate') {
      this.oCount++;
    } else {
      this.qCount++;
    }
    this.sendInput();
  }

  say(phrase: number): void {
    net.sendMsg({ t: 'say', p: phrase });
  }

  emote(): void {
    net.sendMsg({ t: 'emo' });
  }

  /** Envía la entrada solo si ha cambiado, y como mucho 15 veces por segundo. */
  private sendInput(): void {
    const x = Math.round(this.held.mx * 100);
    const y = Math.round(this.held.my * 100);
    const r = this.held.sprint ? 1 : 0;
    const L = this.lastSent;
    const changed = x !== L.x || y !== L.y || r !== L.r || this.aCount !== L.a || this.bCount !== L.b || this.oCount !== L.o || this.qCount !== L.q;
    if (!changed) return;
    const now = performance.now();
    if (now - this.lastSendAt < INPUT_INTERVAL) return;
    this.lastSendAt = now;
    this.lastSent = { x, y, r, a: this.aCount, b: this.bCount, o: this.oCount, q: this.qCount };
    net.sendMsg({ t: 'in', x, y, r, a: this.aCount, b: this.bCount, o: this.oCount, q: this.qCount });
  }

  destroy(): void {
    this.unsub();
  }
}
