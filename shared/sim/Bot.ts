import { AIParams, BALANCE, RESCUE, TILE } from '../balance';
import { DistField, Grid, Terrain } from '../grid';
import type { BiomeId } from '../maps';
import type { SimChar } from './Char';
import type { Intent, PickupType } from './types';

/** Lo que la IA necesita del mundo. */
export interface BotWorld {
  grid: Grid;
  mapId: BiomeId;
  ai: AIParams;
  matchTime: number;
  chars: SimChar[];
  pickups: { dead: boolean; type: PickupType; x: number; y: number }[];
  /** Distancia caminando desde el perseguidor vivo más cercano a cada tile. */
  dangerField(): DistField;
  /** ¿Puede este perseguidor ver a este escapista? (arbustos, humo...) */
  canSee(viewer: SimChar, target: SimChar): boolean;
}

type Mode = 'chase' | 'search' | 'flee' | 'item' | 'wander' | 'hide' | 'rescue';

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
    if (this.decideTimer <= 0) {
      const r = this.w.ai.reaction;
      this.decideTimer = r * (0.75 + rand() * 0.5);
      if (this.ch.isChaser) this.decideChaser();
      else this.decideEscapist();
    }
    if (this.ch.isChaser) this.steerChaser(dt, it);
    else this.steerEscapist(dt, it);
    this.checkStuck(dt, it);
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
    for (const e of w.chars) {
      if (!e.free || e.isChaser) continue;
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
        if (o === me || !o.isChaser || o.targetId !== e.id) continue;
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
      if (o !== me && o.isChaser && o.targetId === best.id && Math.hypot(o.x - best.x, o.y - best.y) < d) flank = true;
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
      // golpe
      if (visible && dist < C.attackRange + t.radius - 2) {
        it.aimX = t.x - me.x;
        it.aimY = t.y - me.y;
        if (this.attackTimer < 0) this.attackTimer = w.ai.attackDelay * (0.6 + rand() * 0.8);
        this.attackTimer -= dt;
        if (this.attackTimer <= 0 && me.attackCd <= 0) {
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
      if (!c.alive || !c.isChaser) continue;
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
      if (me.specialCd <= 0 && nd < 34 && (me.hp <= 50 || rand() < 0.3) && rand() < ai.dashChance * 0.7) this.wantSmoke = true;
      return;
    }

    // Sin peligro: ¿hay un objeto que merezca la pena?
    const anyTrapped = w.chars.some((c) => c.trapped > 0 && !c.isChaser);
    let bestItem = -1;
    let bestItemScore = Infinity;
    for (const p of w.pickups) {
      if (p.dead) continue;
      if (p.type === 'medkit' && me.hp >= me.maxHp) continue;
      if (p.type === 'shield' && me.shield) continue;
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
      if (!c.alive || !c.isChaser) continue;
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
      for (const c of w.chars) if (c.isChaser && c.alive) guard = Math.min(guard, Math.hypot(c.x - t.x, c.y - t.y));
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
