import { AIParams, BALANCE, MODES, RESCUE, TILE } from '../balance';
import { DistField, Grid, Terrain } from '../grid';
import type { HouseLayout } from '../house';
import type { MapId } from '../maps';
import type { Prop } from '../props';
import { wrapAngle } from './Char';
import type { SimChar } from './Char';
import type { Intent, ModeId, PickupType } from './types';

/** Lo que la IA necesita del mundo. */
export interface BotWorld {
  grid: Grid;
  mapId: MapId;
  mode: ModeId;
  /** Fase del modo (Escondite: 0 = esconderse). */
  phase: number;
  props: Prop[];
  /** La casa: habitaciones y luces encendidas. */
  house: HouseLayout | null;
  lights: Uint8Array;
  /** Pistas sonoras recientes (Escondite). */
  hints: { x: number; y: number; t: number }[];
  /** ¿Persigue (cazador) o huye? Depende del modo. */
  isHunter(c: SimChar): boolean;
  canPickup(c: SimChar, type: PickupType): boolean;
  ai: AIParams;
  matchTime: number;
  chars: SimChar[];
  pickups: { dead: boolean; type: PickupType; x: number; y: number }[];
  /** Distancia caminando desde el perseguidor vivo más cercano a cada tile. */
  dangerField(): DistField;
  /** ¿Puede este perseguidor ver a este escapista? (arbustos, humo...) */
  canSee(viewer: SimChar, target: SimChar): boolean;
}

type Mode = 'chase' | 'search' | 'flee' | 'item' | 'wander' | 'hide' | 'rescue' | 'probe';

const rand = Math.random;

/** Cerebro de los bots: decide cada "tiempo de reacción" y conduce cada frame. */
export class BotBrain {
  mode: Mode = 'wander';
  private path: number[] = [];
  private pathIdx = 0;
  private goalTile = -1;
  private goalX = 0;
  private goalY = 0;
  private decideTimer: number;
  private repathTimer = 0;
  private target: SimChar | null = null;
  private attackTimer = -1;
  private wantThrow = false;
  private aimX = 0;
  private aimY = 0;
  private wantSmoke = false;
  private dangerTimer = -1;
  private dashRolled = false;
  private stuckTimer = 0;
  private stuckX = 0;
  private stuckY = 0;
  private wanderTimer = 0;
  private lastSeen = new Map<number, { x: number; y: number; t: number }>();
  private rescueTarget: SimChar | null = null;
  /** La casa: interruptor al que va a encender la luz (-1 = ninguno). */
  private lightGoal = -1;
  /** Escondite: objeto/sospechoso al que va a golpear, y los ya comprobados. */
  private probe: { x: number; y: number; char: SimChar | null } | null = null;
  private checked = new Set<string>();
  private doneHints = new Set<object>();
  private hideSpot: { x: number; y: number } | null = null;
  private hideState: 'go' | 'hidden' | 'flee' = 'go';

  constructor(private ch: SimChar, private w: BotWorld) {
    this.decideTimer = rand() * 0.3;
    this.stuckX = ch.x;
    this.stuckY = ch.y;
  }

  update(dt: number, it: Intent): void {
    if (!this.ch.alive) return;
    this.decideTimer -= dt;
    this.repathTimer -= dt;
    this.wanderTimer -= dt;
    if (this.w.mode === 'escondite') {
      if (this.ch.isChaser) this.seeker(dt, it);
      else this.hider(dt, it);
      this.checkStuck(dt, it);
      return;
    }
    const hunter = this.w.isHunter(this.ch);
    if (this.decideTimer <= 0) {
      const r = this.w.ai.reaction;
      this.decideTimer = r * (0.75 + rand() * 0.5);
      if (hunter) this.decideChaser();
      else this.decideEscapist();
    }
    if (hunter) this.steerChaser(dt, it);
    else this.steerEscapist(dt, it);
    this.checkStuck(dt, it);
  }

  // ================================================================== ESCONDITE

  private hider(dt: number, it: Intent): void {
    const me = this.ch;
    const w = this.w;
    let nd = Infinity;
    let nearest: SimChar | null = null;
    for (const c of w.chars) {
      if (!c.alive || !c.isChaser) continue;
      const d = Math.hypot(c.x - me.x, c.y - me.y);
      if (d < nd) {
        nd = d;
        nearest = c;
      }
    }
    // Descubierto (le han golpeado) o un buscador a punto de darle: huye.
    if (this.hideState !== 'flee' && me.disguise < 0 && w.phase === 1 && nd < 70) this.hideState = 'flee';
    if (this.hideState === 'hidden' && nearest && nd < 22 && nearest.windup > 0 && rand() < 0.5 * dt * 10) this.hideState = 'flee';
    if (this.hideState === 'flee') {
      if (nd > 130 && me.specialCd <= 0) {
        this.hideState = 'go';
        this.hideSpot = null;
      } else {
        if (this.decideTimer <= 0) {
          this.decideTimer = w.ai.reaction;
          this.decideEscapist();
        }
        this.steerEscapist(dt, it);
        return;
      }
    }
    if (this.hideState === 'hidden') {
      // Quieto como una estatua (anclado con SHIFT).
      it.sprint = true;
      if (me.disguise < 0) this.hideState = 'go';
      // Tras hacer ruido, a veces se cambia de sitio si hay un buscador cerca (arriesgado: se ve moverse).
      const myHint = w.hints.find((h) => Math.abs(h.x - me.x) < 2 && Math.abs(h.y - me.y) < 2 && w.matchTime - h.t < 0.5);
      if (myHint && nd < 200 && rand() < 0.4) {
        this.hideState = 'go';
        this.hideSpot = null;
      }
      return;
    }
    // Buscar un sitio junto a objetos parecidos.
    if (!this.hideSpot) {
      const g = w.grid;
      let best: { x: number; y: number } | null = null;
      let bs = -Infinity;
      for (let k = 0; k < 24 && w.props.length; k++) {
        const p = w.props[Math.floor(rand() * w.props.length)];
        const d = Math.hypot(p.x - me.x, p.y - me.y);
        if (d > 22 * TILE) continue;
        let s = -d * 0.05 + rand() * 6;
        if (nearest) s += Math.min(nd, Math.hypot(p.x - nearest.x, p.y - nearest.y)) * 0.03;
        if (s > bs) {
          bs = s;
          // Al lado del objeto (en un hueco libre), como si fueran dos iguales.
          const ang = rand() * Math.PI * 2;
          const x = p.x + Math.cos(ang) * 14;
          const y = p.y + Math.sin(ang) * 10;
          if (!g.walkable(Math.floor(x / TILE), Math.floor(y / TILE))) continue;
          best = { x, y };
        }
      }
      this.hideSpot = best ?? { x: me.x, y: me.y };
      const t = w.grid.tileOf(this.hideSpot.x, this.hideSpot.y);
      this.setGoal(t, this.hideSpot.x, this.hideSpot.y, true);
    }
    const dx = this.hideSpot.x - me.x;
    const dy = this.hideSpot.y - me.y;
    if (Math.hypot(dx, dy) < 5) {
      if (me.disguise < 0 || rand() < 0.02) it.special = true;
      else this.hideState = 'hidden';
      return;
    }
    const p = this.followPath();
    const l = Math.hypot(p.x, p.y);
    if (l > 0.01) {
      it.mx = p.x / l;
      it.my = p.y / l;
    } else {
      it.mx = dx / Math.hypot(dx, dy);
      it.my = dy / Math.hypot(dx, dy);
    }
    // Disfrazarse por el camino si hay buscadores cerca.
    if (w.phase === 1 && me.disguise < 0 && nd < 160 && me.specialCd <= 0) it.special = true;
  }

  private seeker(dt: number, it: Intent): void {
    const me = this.ch;
    const w = this.w;
    if (w.phase === 0) return;
    // ¿Algún escondido a la vista (sin disfraz)? Persecución normal.
    const visible = w.chars.some((e) => e.alive && !e.isChaser && e.disguise < 0 && w.canSee(me, e) && Math.hypot(e.x - me.x, e.y - me.y) < 200);
    if (visible) {
      this.probe = null;
      if (this.decideTimer <= 0) {
        this.decideTimer = w.ai.reaction;
        this.decideChaser();
      }
      this.steerChaser(dt, it);
      return;
    }
    // La casa: si la habitación está a oscuras, primero enciende la luz.
    if (this.lightGoal >= 0) {
      const h = w.house!;
      if (w.lights[h.roomOf[this.lightGoal]] || w.grid.tileOf(me.x, me.y) === this.lightGoal) this.lightGoal = -1;
      else {
        const p = this.followPath();
        const l = Math.hypot(p.x, p.y);
        if (l > 0.01) {
          it.mx = p.x / l;
          it.my = p.y / l;
        }
        return;
      }
    }
    if (this.decideTimer <= 0 || !this.probe) {
      this.decideTimer = w.ai.reaction * 1.5;
      const h = w.house;
      const r = h ? h.roomOf[w.grid.tileOf(me.x, me.y)] : -1;
      if (h && r >= 0 && !w.lights[r] && h.rooms[r].switches.length && rand() < 0.6) {
        this.lightGoal = h.rooms[r].switches[0];
        const c = w.grid.tileCenter(this.lightGoal);
        this.setGoal(this.lightGoal, c.x, c.y, true);
        return;
      }
      this.pickProbe();
    }
    const pr = this.probe;
    if (!pr) return;
    const tx = pr.char ? pr.char.x : pr.x;
    const ty = pr.char ? pr.char.y : pr.y;
    const d = Math.hypot(tx - me.x, ty - me.y);
    const C = BALANCE.chaser;
    if (d < C.attackRange - 3) {
      it.aimX = tx - me.x;
      it.aimY = ty - me.y;
      const ang = Math.abs(wrapAngle(Math.atan2(it.aimY, it.aimX) - Math.atan2(me.fy, me.fx)));
      if (me.attackCd <= 0 && me.swing <= 0 && ang < 0.6) {
        it.action = true;
        this.checked.add(`${Math.round(tx / 4)},${Math.round(ty / 4)}`);
        this.probe = null;
        this.decideTimer = 0.35;
      } else {
        it.mx = (tx - me.x) / Math.max(d, 1) * 0.3;
        it.my = (ty - me.y) / Math.max(d, 1) * 0.3;
      }
      return;
    }
    if (d < 40 && w.grid.clearPath(me.x, me.y, tx, ty, me.radius)) {
      it.mx = (tx - me.x) / d;
      it.my = (ty - me.y) / d;
      return;
    }
    const p = this.followPath();
    const l = Math.hypot(p.x, p.y);
    if (l > 0.01) {
      it.mx = p.x / l;
      it.my = p.y / l;
    }
  }

  /** Elige el siguiente objeto sospechoso: real o disfrazado, sin saber cuál es cuál. */
  private pickProbe(): void {
    const me = this.ch;
    const w = this.w;
    const now = w.matchTime;
    // ¿Ha sonado una pista cerca? Va directo a lo que haya justo donde sonó.
    let hint: { x: number; y: number; t: number } | null = null;
    let hd = Infinity;
    for (const h of w.hints) {
      if (now - h.t > 12 || this.doneHints.has(h)) continue;
      const d = Math.hypot(h.x - me.x, h.y - me.y);
      if (d < 24 * TILE && d < hd) {
        hd = d;
        hint = h;
      }
    }
    if (hint) {
      let bestH: { x: number; y: number; char: SimChar | null } | null = null;
      let bh = 40;
      const near = (x: number, y: number, char: SimChar | null) => {
        if (this.checked.has(`${Math.round(x / 4)},${Math.round(y / 4)}`)) return;
        const d = Math.hypot(x - hint!.x, y - hint!.y);
        if (d < bh) {
          bh = d;
          bestH = { x, y, char };
        }
      };
      for (const p of w.props) near(p.x, p.y, null);
      for (const c of w.chars) if (c.alive && !c.isChaser && c.disguise >= 0) near(c.x, c.y, c);
      if (bestH) {
        const b = bestH as { x: number; y: number; char: SimChar | null };
        this.mode = 'probe';
        this.probe = b;
        this.setGoal(w.grid.nearestWalkable(b.x, b.y), b.x, b.y);
        return;
      }
      this.doneHints.add(hint);
    }
    const hp = me.hp / MODES.escondite.seekerHp;
    let best: { x: number; y: number; char: SimChar | null } | null = null;
    let bs = Infinity;
    const consider = (x: number, y: number, char: SimChar | null) => {
      if (this.checked.has(`${Math.round(x / 4)},${Math.round(y / 4)}`)) return;
      const d = Math.hypot(x - me.x, y - me.y);
      if (d > 26 * TILE) return;
      let s = d + rand() * 60;
      // Las pistas sonoras: lo más cerca del ruido es lo más sospechoso.
      for (const h of w.hints) {
        if (now - h.t > 12 || Math.hypot(h.x - me.x, h.y - me.y) > 22 * TILE) continue;
        const dh = Math.hypot(h.x - x, h.y - y);
        if (dh < 40) s -= 260 - dh * 3;
      }
      let cue = false;
      // Un objeto que se mueve es muy sospechoso.
      if (char && char.speedNow > 8 && d < 170) {
        s -= 260;
        cue = true;
      }
      // Dos objetos iguales pegados: uno puede ser un disfrazado.
      const k = char ? char.disguise : kindAt.get(`${x},${y}`);
      for (const o of all) {
        if (o.x === x && o.y === y) continue;
        if (o.k === k && Math.abs(o.x - x) < 24 && Math.abs(o.y - y) < 24) {
          s -= 110;
          cue = true;
          break;
        }
      }
      // Sin pistas, golpear a lo loco duele: solo con vida de sobra y no muy lejos.
      if (!cue && (hp < 0.6 || d > 12 * TILE)) return;
      if (s < bs) {
        bs = s;
        best = { x, y, char };
      }
    };
    const all: { x: number; y: number; k: number }[] = [];
    const kindAt = new Map<string, number>();
    for (const p of w.props) {
      all.push({ x: p.x, y: p.y, k: p.k });
      kindAt.set(`${p.x},${p.y}`, p.k);
    }
    for (const c of w.chars) if (c.alive && !c.isChaser && c.disguise >= 0) all.push({ x: c.x, y: c.y, k: c.disguise });
    for (const p of w.props) consider(p.x, p.y, null);
    for (const c of w.chars) if (c.alive && !c.isChaser && c.disguise >= 0) consider(c.x, c.y, c);
    if (!best) {
      // Todo comprobado: vuelve a empezar.
      this.checked.clear();
      this.mode = 'search';
      this.pickSearchGoal();
      return;
    }
    this.mode = 'probe';
    this.probe = best;
    const b = best as { x: number; y: number };
    this.setGoal(w.grid.nearestWalkable(b.x, b.y), b.x, b.y);
  }

  // ================================================================== PERSEGUIDOR

  private decideChaser(): void {
    const me = this.ch;
    const w = this.w;
    const ai = w.ai;
    const now = w.matchTime;
    let best: SimChar | null = null;
    let bestScore = Infinity;
    let bestPos = { x: 0, y: 0 };
    let bestVisible = false;
    const bomba = w.mode === 'bomba';
    for (const e of w.chars) {
      if (!e.free || w.isHunter(e) || e === me) continue;
      if (bomba && e.id === me.lastFrom && me.passCd > 0) continue;
      const visible = w.canSee(me, e);
      if (visible) this.lastSeen.set(e.id, { x: e.x, y: e.y, t: now });
      const seen = this.lastSeen.get(e.id);
      if (!visible && (!seen || now - seen.t > 3.5)) continue;
      const pos = visible ? { x: e.x, y: e.y } : { x: seen!.x, y: seen!.y };
      const d = Math.hypot(pos.x - me.x, pos.y - me.y);
      let s = d + (e.hp / e.maxHp) * 45;
      if (!visible) s += 60;
      if (!w.grid.lineOfSight(me.x, me.y, pos.x, pos.y)) s += 35;
      // coordinación: penaliza objetivos ya perseguidos por otro más cerca
      for (const o of w.chars) {
        if (o === me || !w.isHunter(o) || o.targetId !== e.id) continue;
        if (Math.hypot(o.x - e.x, o.y - e.y) < d) s += 75;
      }
      if (this.target === e) s -= 25; // algo de constancia
      if (s < bestScore) {
        bestScore = s;
        best = e;
        bestPos = pos;
        bestVisible = visible;
      }
    }

    this.target = best;
    me.targetId = best ? best.id : -1;

    if (!best) {
      this.mode = 'search';
      if (this.wanderTimer <= 0 || this.pathIdx >= this.path.length) this.pickSearchGoal();
      return;
    }
    this.mode = 'chase';
    const d = Math.hypot(bestPos.x - me.x, bestPos.y - me.y);
    // ¿Hay otro perseguidor más cerca del mismo objetivo? Entonces intento cortarle el paso.
    let flank = false;
    for (const o of w.chars) {
      if (o !== me && w.isHunter(o) && o.targetId === best.id && Math.hypot(o.x - best.x, o.y - best.y) < d) flank = true;
    }
    const tLead = bestVisible ? ai.lead * Math.min(1.2, d / 90) + (flank ? 0.7 : 0) : 0;
    const gx = bestPos.x + best.vx * tLead;
    const gy = bestPos.y + best.vy * tLead;
    const gt = w.grid.nearestWalkable(gx, gy);
    const c = w.grid.tileCenter(gt);
    this.setGoal(gt, d < 40 ? bestPos.x : c.x, d < 40 ? bestPos.y : c.y);

    // ¿Lanzar jamón?
    const C = BALANCE.chaser;
    if (
      w.mode === 'pilla' &&
      bestVisible &&
      me.specialCd <= 0 &&
      d > 42 &&
      d < C.throwRange * 0.85 &&
      w.grid.lineOfSight(me.x, me.y, best.x, best.y) &&
      rand() < ai.throwChance * 0.45
    ) {
      const t = d / C.throwSpeed;
      const px = best.x + best.vx * t * ai.lead;
      const py = best.y + best.vy * t * ai.lead;
      const ang = Math.atan2(py - me.y, px - me.x) + (rand() * 2 - 1) * ai.aimError;
      this.aimX = Math.cos(ang);
      this.aimY = Math.sin(ang);
      this.wantThrow = true;
    }
  }

  private pickSearchGoal(): void {
    const g = this.w.grid;
    // Busca cerca de donde vio a alguien por última vez, o un tile aleatorio (los arbustos son sospechosos).
    let anchor: { x: number; y: number } | null = null;
    let newest = -1;
    for (const v of this.lastSeen.values()) if (v.t > newest) {
      newest = v.t;
      anchor = v;
    }
    // A veces vigila a un rojo atrapado: alguien vendrá a rescatarlo.
    const trapped = this.w.chars.filter((c) => c.trapped > 0 && !c.isChaser);
    if (trapped.length && rand() < 0.6) anchor = trapped[Math.floor(rand() * trapped.length)];
    let bestTile = g.passable[Math.floor(rand() * g.passable.length)];
    let bestScore = -Infinity;
    for (let k = 0; k < 24; k++) {
      const t = g.passable[Math.floor(rand() * g.passable.length)];
      const c = g.tileCenter(t);
      let s = rand() * 50;
      if (g.terrain[t] === Terrain.Bush) s += 40;
      if (anchor) s -= Math.hypot(c.x - anchor.x, c.y - anchor.y) * 0.4;
      else s -= Math.hypot(c.x - this.ch.x, c.y - this.ch.y) * 0.1;
      if (s > bestScore) {
        bestScore = s;
        bestTile = t;
      }
    }
    const c = g.tileCenter(bestTile);
    this.setGoal(bestTile, c.x, c.y, true);
    this.wanderTimer = 3 + rand() * 2;
  }

  private steerChaser(dt: number, it: Intent): void {
    const me = this.ch;
    const w = this.w;
    const t = this.target;
    const C = BALANCE.chaser;

    let dirX = 0;
    let dirY = 0;
    let dist = Infinity;
    if (t && t.free && this.mode === 'chase') {
      const visible = w.canSee(me, t);
      dist = Math.hypot(t.x - me.x, t.y - me.y);
      if (visible && dist < 150 && w.grid.clearPath(me.x, me.y, t.x, t.y, me.radius)) {
        // persecución directa con un poco de anticipación
        const lead = Math.min(0.35, dist / 200) * w.ai.lead;
        dirX = t.x + t.vx * lead - me.x;
        dirY = t.y + t.vy * lead - me.y;
      }
      // golpe (o abalanzarse, en Infección y Bomba)
      const reach = w.mode === 'pilla' || w.mode === 'escondite' ? C.attackRange + t.radius - 2 : 26;
      if (visible && dist < reach) {
        it.aimX = t.x - me.x;
        it.aimY = t.y - me.y;
        if (this.attackTimer < 0) this.attackTimer = w.ai.attackDelay * (0.6 + rand() * 0.8);
        this.attackTimer -= dt;
        if (this.attackTimer <= 0 && (w.mode === 'pilla' || w.mode === 'escondite' ? me.attackCd <= 0 : me.dashCd <= 0 && rand() < 0.5)) {
          it.action = true;
          this.attackTimer = -1;
        }
        if (dist < 9) {
          dirX = t.x - me.x;
          dirY = t.y - me.y;
        }
      } else {
        this.attackTimer = -1;
      }
      it.sprint = visible && dist < 120 && dist > 20 && me.energy > 25;
    }
    if (dirX === 0 && dirY === 0) {
      const p = this.followPath();
      dirX = p.x;
      dirY = p.y;
      if (this.mode === 'search') it.sprint = false;
    }
    const l = Math.hypot(dirX, dirY);
    if (l > 0.001) {
      it.mx = dirX / l;
      it.my = dirY / l;
    }
    if (this.wantThrow) {
      it.special = true;
      it.aimX = this.aimX;
      it.aimY = this.aimY;
      this.wantThrow = false;
    }
  }

  // ================================================================== ESCAPISTA

  private decideEscapist(): void {
    const me = this.ch;
    const w = this.w;
    const ai = w.ai;
    const g = w.grid;
    const field = w.dangerField();
    const myTile = g.tileOf(me.x, me.y);

    let nearest: SimChar | null = null;
    let nd = Infinity;
    for (const c of w.chars) {
      if (!c.alive || !w.isHunter(c) || c === me) continue;
      const d = Math.hypot(c.x - me.x, c.y - me.y);
      if (d < nd) {
        nd = d;
        nearest = c;
      }
    }
    const walkDanger = field.dist[myTile] * TILE;
    const danger = nearest !== null && (nd < ai.dangerRadius || walkDanger < ai.dangerRadius * 0.9);

    // Rescate valiente: si un compañero atrapado está cerca y llego antes que los azules, voy.
    const rescue = this.pickRescue(me, nearest, danger ? 6 : 22);
    if (rescue) {
      this.rescueTarget = rescue;
      this.mode = 'rescue';
      this.setGoal(g.tileOf(rescue.x, rescue.y), rescue.x, rescue.y);
      return;
    }

    if (danger) {
      this.mode = 'flee';
      const self = g.dijkstra([myTile], 13);
      let best = -1;
      let bestScore = -Infinity;
      const forest = w.mapId === 'forest';
      for (const t of g.passable) {
        const sd = self.dist[t];
        if (!Number.isFinite(sd) || sd < 1.5) continue;
        const cd = field.dist[t];
        let s = cd - sd * 0.4 + g.openness[t] * 5;
        if (sd >= cd) s -= 12;
        // Las esquinas y los bordes son trampas.
        s -= this.edgePenalty(t);
        const ter = g.terrain[t];
        if (ter === Terrain.Quicksand) s -= 4;
        if (ter === Terrain.Ice) s -= 1;
        if (ter === Terrain.Bush && forest) s += 1.5;
        if (s > bestScore) {
          bestScore = s;
          best = t;
        }
      }
      if (best >= 0) {
        this.path = g.pathFromField(self, best);
        this.pathIdx = 0;
        this.goalTile = best;
        const c = g.tileCenter(best);
        this.goalX = c.x;
        this.goalY = c.y;
      }
      if (w.mode === 'pilla' && me.specialCd <= 0 && nd < 34 && (me.hp <= 50 || rand() < 0.3) && rand() < ai.dashChance * 0.7) this.wantSmoke = true;
      if (w.mode === 'infeccion' && me.heldItem && nd < 46 && rand() < ai.dashChance) this.wantSmoke = true;
      return;
    }

    // Sin peligro: ¿hay un objeto que merezca la pena?
    const anyTrapped = w.chars.some((c) => c.trapped > 0 && !c.isChaser);
    let bestItem = -1;
    let bestItemScore = Infinity;
    for (const p of w.pickups) {
      if (p.dead) continue;
      if (p.type !== 'coin' && !w.canPickup(me, p.type)) continue;
      if (p.type === 'gold' && !anyTrapped) continue;
      const pt = g.tileOf(p.x, p.y);
      const myD = Math.hypot(p.x - me.x, p.y - me.y);
      const chaserD = field.dist[pt] * TILE;
      if (myD > 20 * TILE || chaserD < myD * 1.3 + 30) continue;
      let s = myD;
      if (p.type === 'medkit') s -= (me.maxHp - me.hp) * 2;
      if (p.type === 'gold') s -= 200;
      if (s < bestItemScore) {
        bestItemScore = s;
        bestItem = pt;
      }
    }
    if (bestItem >= 0) {
      this.mode = 'item';
      const c = g.tileCenter(bestItem);
      this.setGoal(bestItem, c.x, c.y);
      return;
    }

    // Esconderse en un arbusto si ya está en uno y es seguro.
    if (me.inBush && field.dist[myTile] * TILE > ai.dangerRadius * 1.2) {
      this.mode = 'hide';
      this.path = [];
      return;
    }

    this.mode = 'wander';
    if (this.wanderTimer <= 0 || this.pathIdx >= this.path.length) {
      let bestT = -1;
      let bestS = -Infinity;
      for (let k = 0; k < 30; k++) {
        const t = g.passable[Math.floor(rand() * g.passable.length)];
        const c = g.tileCenter(t);
        const dMe = Math.hypot(c.x - me.x, c.y - me.y);
        if (dMe > 14 * TILE) continue;
        let s = field.dist[t] + g.openness[t] * 6 - dMe / TILE * 0.3 + rand() * 4 - this.edgePenalty(t) * 1.5;
        if (g.terrain[t] === Terrain.Bush) s += 6;
        if (g.terrain[t] === Terrain.Quicksand) s -= 8;
        if (s > bestS) {
          bestS = s;
          bestT = t;
        }
      }
      if (bestT >= 0) {
        const c = g.tileCenter(bestT);
        this.setGoal(bestT, c.x, c.y, true);
      }
      this.wanderTimer = 2.5 + rand() * 3;
    }
  }

  private steerEscapist(dt: number, it: Intent): void {
    const me = this.ch;
    const w = this.w;
    const ai = w.ai;
    let nearest: SimChar | null = null;
    let nd = Infinity;
    for (const c of w.chars) {
      if (!c.alive || !w.isHunter(c) || c === me) continue;
      const d = Math.hypot(c.x - me.x, c.y - me.y);
      if (d < nd) {
        nd = d;
        nearest = c;
      }
    }

    let dirX = 0;
    let dirY = 0;
    const rt = this.rescueTarget;
    const rescuing = this.mode === 'rescue' && rt && rt.trapped > 0 && Math.hypot(rt.x - me.x, rt.y - me.y) < RESCUE.radius - 6;
    if (this.mode !== 'hide' && !rescuing) {
      const p = this.followPath();
      dirX = p.x;
      dirY = p.y;
    }
    if (nearest && nd < 30) {
      // Muy cerca: alejarse directamente, mezclado con la ruta.
      const ax = (me.x - nearest.x) / Math.max(nd, 1);
      const ay = (me.y - nearest.y) / Math.max(nd, 1);
      const pl = Math.hypot(dirX, dirY);
      if (pl < 0.1 || ax * dirX + ay * dirY < -0.2 * pl) {
        dirX = ax;
        dirY = ay;
      } else {
        dirX = dirX / pl + ax * 0.6;
        dirY = dirY / pl + ay * 0.6;
      }
    }
    const l = Math.hypot(dirX, dirY);
    if (l > 0.001) {
      it.mx = dirX / l;
      it.my = dirY / l;
    }

    // Sprint cuando hay peligro
    it.sprint = this.mode === 'flee' && nd < 90 && me.energy > 8;

    // Dash: preventivo cuando el perseguidor se acerca demasiado, o para esquivar un golpe.
    if (nearest && nd < 30) {
      if (this.dangerTimer < 0) {
        this.dangerTimer = ai.reaction * 0.5;
        this.dashRolled = rand() < ai.dashChance;
      }
      this.dangerTimer -= dt;
      const threatening = nearest.windup > 0 || nd < 22;
      if (this.dangerTimer <= 0 && this.dashRolled && threatening && me.dashCd <= 0) {
        const ax = (me.x - nearest.x) / Math.max(nd, 1);
        const ay = (me.y - nearest.y) / Math.max(nd, 1);
        // Si la ruta va hacia el perseguidor, mejor salir en perpendicular.
        if (l < 0.01 || it.mx * ax + it.my * ay < 0) {
          const side = rand() < 0.5 ? 1 : -1;
          it.mx = ax * 0.6 - ay * side * 0.8;
          it.my = ay * 0.6 + ax * side * 0.8;
        }
        it.action = true;
        this.dashRolled = false;
      }
    } else {
      this.dangerTimer = -1;
    }
    if (this.wantSmoke) {
      it.special = true;
      this.wantSmoke = false;
    }
  }

  /** Compañero atrapado al que merece la pena ir a rescatar (o null). */
  private pickRescue(me: SimChar, nearestChaser: SimChar | null, maxTiles: number): SimChar | null {
    const w = this.w;
    let best: SimChar | null = null;
    let bestD = Infinity;
    for (const t of w.chars) {
      if (t.isChaser || t.trapped <= 0 || t === me) continue;
      const d = Math.hypot(t.x - me.x, t.y - me.y);
      if (d > maxTiles * TILE) continue;
      // ¿llego a tiempo?
      if (d / (BALANCE.escapist.speed * 0.9) + RESCUE.rescueTime > t.trapped + 0.3) continue;
      // el azul más cercano al atrapado no debe estar mucho más cerca que yo
      let guard = Infinity;
      for (const c of w.chars) if (w.isHunter(c) && c.alive) guard = Math.min(guard, Math.hypot(c.x - t.x, c.y - t.y));
      if (guard < 26 && d > 30) continue;
      if (guard < d * 0.6) continue;
      if (d < bestD) {
        bestD = d;
        best = t;
      }
    }
    void nearestChaser;
    return best;
  }

  /** Penalización por estar cerca de los bordes del mapa (ahí te acorralan). */
  private edgePenalty(t: number): number {
    const g = this.w.grid;
    const tx = t % g.w;
    const ty = (t / g.w) | 0;
    const f = (e: number) => (e <= 2 ? (3 - e) * 1.8 : 0);
    // En una esquina se suman las dos penalizaciones.
    return f(Math.min(tx, g.w - 1 - tx)) + f(Math.min(ty, g.h - 1 - ty));
  }

  // ================================================================== navegación

  private setGoal(tile: number, x: number, y: number, force = false): void {
    const g = this.w.grid;
    const changed = this.goalTile < 0 || Math.hypot(x - this.goalX, y - this.goalY) > TILE * 1.5;
    this.goalX = x;
    this.goalY = y;
    if (!force && !changed && this.repathTimer > 0 && this.pathIdx < this.path.length) return;
    this.goalTile = tile;
    const start = g.tileOf(this.ch.x, this.ch.y);
    const p = g.astar(g.walkableIdx(start) ? start : g.nearestWalkable(this.ch.x, this.ch.y), tile);
    this.path = p ?? [];
    this.pathIdx = 0;
    this.repathTimer = this.w.ai.repath;
  }

  private followPath(): { x: number; y: number } {
    const me = this.ch;
    const g = this.w.grid;
    if (this.pathIdx >= this.path.length) {
      // destino final exacto
      const dx = this.goalX - me.x;
      const dy = this.goalY - me.y;
      if (this.goalTile >= 0 && Math.hypot(dx, dy) > 3 && g.clearPath(me.x, me.y, this.goalX, this.goalY, me.radius)) return { x: dx, y: dy };
      return { x: 0, y: 0 };
    }
    // atajos: el waypoint más lejano visible en línea recta
    const maxK = Math.min(this.path.length - 1, this.pathIdx + 4);
    for (let k = maxK; k > this.pathIdx; k--) {
      const c = g.tileCenter(this.path[k]);
      if (g.clearPath(me.x, me.y, c.x, c.y, me.radius)) {
        this.pathIdx = k;
        break;
      }
    }
    const c = g.tileCenter(this.path[this.pathIdx]);
    const dx = c.x - me.x;
    const dy = c.y - me.y;
    if (Math.hypot(dx, dy) < 4) {
      this.pathIdx++;
      return this.followPath();
    }
    return { x: dx, y: dy };
  }

  private checkStuck(dt: number, it: Intent): void {
    this.stuckTimer += dt;
    if (this.stuckTimer < 0.7) return;
    const moved = Math.hypot(this.ch.x - this.stuckX, this.ch.y - this.stuckY);
    const trying = Math.hypot(it.mx, it.my) > 0.5;
    if (trying && moved < 3) {
      // Atascado: recalcula ruta y da un pequeño empujón lateral.
      this.repathTimer = 0;
      this.wanderTimer = 0;
      const g = this.w.grid;
      const start = g.nearestWalkable(this.ch.x, this.ch.y);
      if (this.goalTile >= 0) {
        this.path = g.astar(start, this.goalTile) ?? [];
        this.pathIdx = 0;
      }
      const c = g.tileCenter(start);
      this.ch.vx += (c.x - this.ch.x) * 4 + (rand() - 0.5) * 30;
      this.ch.vy += (c.y - this.ch.y) * 4 + (rand() - 0.5) * 30;
    }
    this.stuckTimer = 0;
    this.stuckX = this.ch.x;
    this.stuckY = this.ch.y;
  }
}
