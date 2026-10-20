import { BALANCE } from '../balance';
import { clampToMap, moveCircle } from '../collision';
import { Terrain } from '../grid';
import type { Look } from '../look';
import { emptyIntent, emptyStats, Intent, SimCtx, Stats, Team } from './types';

const B = BALANCE;
export const SWING_TIME = 0.24;
/** Las pulsaciones se recuerdan un instante (input buffer). */
export const PRESS_BUFFER = 0.15;

export type HitResult = 'hit' | 'blocked' | 'dodged' | 'none';

export function wrapAngle(a: number): number {
  while (a > Math.PI) a -= Math.PI * 2;
  while (a < -Math.PI) a += Math.PI * 2;
  return a;
}

/**
 * Personaje de la simulación: movimiento, habilidades y daño.
 * No sabe nada de Phaser; lo usan el modo offline, el servidor y la predicción.
 */
export class SimChar {
  readonly id: number;
  readonly team: Team;
  name: string;
  look: Look;
  /** Controlado por una persona (si no, por un bot). */
  human: boolean;
  readonly radius = B.bodyRadius;

  x: number;
  y: number;
  vx = 0;
  vy = 0;
  kbx = 0;
  kby = 0;
  fx = 0;
  fy = 1;

  hp: number;
  readonly maxHp: number;
  energy: number;
  readonly energyMax: number;
  exhaustTimer = 0;
  alive = true;

  attackCd = 0;
  dashCd = 0;
  specialCd = 0;
  windup = 0;
  swing = 0;
  dashTime = 0;
  dashX = 0;
  dashY = 0;
  stun = 0;
  invuln = 0;
  bootTime = 0;
  shield = false;
  sprinting = false;
  straightTime = 0;
  refAngle = 0;
  inBush = false;
  hamHidden = 0;
  actionBuf = 0;
  specialBuf = 0;
  /** Enfriamiento de las frases (bocadillos). */
  sayCd = 0;

  stats: Stats = emptyStats();
  deathTime = -1;
  /** Para coordinar bots perseguidores. */
  targetId = -1;
  terrain: Terrain = Terrain.Ground;
  /** Última intención aplicada (la IA y la vista la leen). */
  intent: Intent = emptyIntent();

  constructor(o: { id: number; team: Team; name: string; look: Look; human: boolean; x: number; y: number }) {
    this.id = o.id;
    this.team = o.team;
    this.name = o.name;
    this.look = o.look;
    this.human = o.human;
    this.x = o.x;
    this.y = o.y;
    const isChaser = o.team === 'chaser';
    this.maxHp = isChaser ? 999 : B.escapist.maxHp;
    this.hp = this.maxHp;
    this.energyMax = isChaser ? B.chaser.energyMax : B.escapist.energyMax;
    this.energy = this.energyMax;
  }

  get isChaser(): boolean {
    return this.team === 'chaser';
  }

  get speedNow(): number {
    return Math.hypot(this.vx + this.kbx, this.vy + this.kby);
  }

  get dashing(): boolean {
    return this.dashTime > 0;
  }

  /** Cooldown de la habilidad principal (golpe o dash) normalizado 0..1 (1 = listo). */
  get actionReady(): number {
    const max = this.isChaser ? B.chaser.attackCooldown : B.escapist.dashCooldown;
    const cd = this.isChaser ? this.attackCd : this.dashCd;
    return 1 - Math.max(0, cd) / max;
  }

  get specialReady(): number {
    const max = this.isChaser ? B.chaser.throwCooldown : B.escapist.smokeCooldown;
    return 1 - Math.max(0, this.specialCd) / max;
  }

  // ------------------------------------------------------------------ bucle

  update(dt: number, ctx: SimCtx, it: Intent): void {
    this.intent = it;
    if (!this.alive) {
      this.updateGhost(dt, ctx, it);
      return;
    }
    if (!ctx.canMove(this)) {
      it.mx = it.my = 0;
      it.action = it.special = it.sprint = false;
    }

    // temporizadores
    this.attackCd -= dt;
    this.dashCd -= dt;
    this.specialCd -= dt;
    this.stun -= dt;
    this.invuln -= dt;
    this.bootTime -= dt;
    this.hamHidden -= dt;
    this.actionBuf -= dt;
    this.specialBuf -= dt;
    if (this.swing > 0) this.swing -= dt;
    if (this.windup > 0) {
      this.windup -= dt;
      if (this.windup <= 0) ctx.meleeHit(this.id);
    }

    // acciones
    if (this.stun <= 0) {
      if (it.action) {
        if (this.isChaser) this.tryAttack(ctx, it);
        else this.tryDash(ctx, it);
      }
      if (it.special) {
        if (this.isChaser) this.tryThrow(ctx, it);
        else this.trySmoke(ctx);
      }
    }

    // dirección
    let mx = this.stun > 0 ? 0 : it.mx;
    let my = this.stun > 0 ? 0 : it.my;
    const len = Math.hypot(mx, my);
    if (len > 1) {
      mx /= len;
      my /= len;
    }
    if (len > 0.2 && this.swing <= 0 && this.dashTime <= 0) {
      this.fx = mx / Math.max(len, 0.0001);
      this.fy = my / Math.max(len, 0.0001);
    }

    // velocidad objetivo
    const grid = ctx.grid;
    this.terrain = grid.terrainAt(this.x, this.y);
    const T = B.terrain;
    const base = this.isChaser ? B.chaser : B.escapist;
    let speed = base.speed * (this.human ? 1 : ctx.ai.speedMul);
    if (this.terrain === Terrain.Quicksand) speed *= T.quicksandSlow;
    else if (this.terrain === Terrain.DeepSnow) speed *= T.deepSnowSlow;
    if (this.bootTime > 0) speed *= B.items.bootMultiplier;

    const wantSprint = it.sprint && len > 0.1 && this.exhaustTimer <= 0 && this.energy > 0;
    this.sprinting = wantSprint;
    if (wantSprint) {
      speed *= base.sprintMultiplier;
      this.energy -= base.sprintDrain * dt;
      if (this.energy <= 0) {
        this.energy = 0;
        this.exhaustTimer = base.exhaustedDelay;
      }
    } else if (this.exhaustTimer > 0) {
      this.exhaustTimer -= dt;
    } else {
      this.energy = Math.min(this.energyMax, this.energy + base.energyRegen * dt);
    }

    if (this.isChaser) {
      const C = B.chaser;
      if (len > 0.3) {
        const ang = Math.atan2(my, mx);
        if (Math.abs(wrapAngle(ang - this.refAngle)) > C.straightAngleTolerance) {
          // Girar no anula el impulso del todo: lo reduce.
          this.refAngle = ang;
          this.straightTime *= C.turnKeep;
        } else {
          this.straightTime += dt;
        }
      } else {
        this.straightTime = 0;
      }
      speed *= 1 + C.straightBonusMax * Math.min(1, this.straightTime / C.straightBonusTime);
      if (this.swing > SWING_TIME - 0.14) speed *= C.attackMoveSlow;
      if (ctx.inSmoke(this.x, this.y)) speed *= B.escapist.smokeSlow;
    }

    // aceleración (el hielo reduce el control)
    let accel = base.accel;
    const onIce = this.terrain === Terrain.Ice;
    if (onIce) accel *= len > 0.1 ? T.iceControl : T.iceControl * T.iceFriction;

    if (this.dashTime > 0) {
      this.dashTime -= dt;
      this.vx = this.dashX * B.escapist.dashSpeed;
      this.vy = this.dashY * B.escapist.dashSpeed;
      if (this.dashTime <= 0) {
        this.vx *= 0.35;
        this.vy *= 0.35;
      }
    } else {
      const dvx = mx * speed - this.vx;
      const dvy = my * speed - this.vy;
      const dl = Math.hypot(dvx, dvy);
      const maxd = accel * dt;
      if (dl <= maxd) {
        this.vx += dvx;
        this.vy += dvy;
      } else {
        this.vx += (dvx / dl) * maxd;
        this.vy += (dvy / dl) * maxd;
      }
    }

    const fr = Math.exp(-B.knockbackFriction * dt * (onIce ? 0.35 : 1));
    this.kbx *= fr;
    this.kby *= fr;
    if (Math.abs(this.kbx) < 1) this.kbx = 0;
    if (Math.abs(this.kby) < 1) this.kby = 0;

    const p = { x: this.x, y: this.y };
    const hit = moveCircle(grid, p, (this.vx + this.kbx) * dt, (this.vy + this.kby) * dt, this.radius);
    if (hit.hitX) {
      this.vx *= onIce ? -0.3 : 0;
      this.kbx *= -0.4;
    }
    if (hit.hitY) {
      this.vy *= onIce ? -0.3 : 0;
      this.kby *= -0.4;
    }
    this.x = p.x;
    this.y = p.y;
    this.inBush = grid.terrainAt(this.x, this.y) === Terrain.Bush;
  }

  // ------------------------------------------------------------------ acciones

  private tryAttack(ctx: SimCtx, it: Intent): void {
    if (this.attackCd > 0 || this.swing > 0) return;
    if (it.aimX || it.aimY) {
      const l = Math.hypot(it.aimX, it.aimY);
      this.fx = it.aimX / l;
      this.fy = it.aimY / l;
    }
    this.attackCd = B.chaser.attackCooldown;
    this.windup = B.chaser.attackWindup;
    this.swing = SWING_TIME;
    this.actionBuf = 0;
    ctx.emit({ t: 'swing', id: this.id });
  }

  private tryDash(ctx: SimCtx, it: Intent): void {
    if (this.dashCd > 0 || this.dashTime > 0) return;
    let dx = it.mx;
    let dy = it.my;
    const l = Math.hypot(dx, dy);
    if (l < 0.2) {
      dx = this.fx;
      dy = this.fy;
    } else {
      dx /= l;
      dy /= l;
    }
    this.fx = dx;
    this.fy = dy;
    this.dashX = dx;
    this.dashY = dy;
    this.dashTime = B.escapist.dashDuration;
    this.dashCd = B.escapist.dashCooldown;
    this.actionBuf = 0;
    ctx.emit({ t: 'dash', id: this.id });
  }

  private trySmoke(ctx: SimCtx): void {
    if (this.specialCd > 0) return;
    this.specialCd = B.escapist.smokeCooldown;
    this.specialBuf = 0;
    ctx.dropSmoke(this.x, this.y);
  }

  private tryThrow(ctx: SimCtx, it: Intent): void {
    if (this.specialCd > 0 || this.hamHidden > 0) return;
    let dx = this.fx;
    let dy = this.fy;
    if (it.aimX || it.aimY) {
      dx = it.aimX;
      dy = it.aimY;
    }
    const l = Math.hypot(dx, dy) || 1;
    this.specialCd = B.chaser.throwCooldown;
    this.hamHidden = 0.7;
    this.specialBuf = 0;
    ctx.throwHam(this.id, this.x + (dx / l) * 6, this.y + (dy / l) * 6, dx / l, dy / l);
  }

  // ------------------------------------------------------------------ daño

  takeHit(ctx: SimCtx, dmg: number, attacker: SimChar | null, nx: number, ny: number, kb: number): HitResult {
    if (!this.alive || this.isChaser) return 'none';
    if (this.dashTime > 0 && B.escapist.dashIFrames) {
      this.stats.dodges++;
      ctx.emit({ t: 'dodge', v: this.id });
      return 'dodged';
    }
    if (this.invuln > 0) return 'none';
    if (this.shield) {
      this.shield = false;
      this.invuln = 0.35;
      this.kbx = nx * kb * 0.5;
      this.kby = ny * kb * 0.5;
      this.stats.blocks++;
      ctx.emit({ t: 'block', v: this.id, nx, ny });
      return 'blocked';
    }
    this.hp = Math.max(0, this.hp - dmg);
    this.stats.hitsTaken++;
    this.invuln = B.hitInvulnerability;
    this.stun = B.hitStun;
    this.vx = 0;
    this.vy = 0;
    this.kbx = nx * kb;
    this.kby = ny * kb;
    if (attacker) {
      attacker.stats.hits++;
      attacker.stats.damage += dmg;
    }
    ctx.emit({ t: 'hit', v: this.id, a: attacker ? attacker.id : -1, dmg, nx, ny });
    if (this.hp <= 0) {
      this.alive = false;
      this.deathTime = ctx.matchTime;
      this.vx = this.vy = this.kbx = this.kby = 0;
      this.dashTime = 0;
      this.shield = false;
      if (attacker) attacker.stats.eliminations++;
      ctx.emit({ t: 'ko', v: this.id, a: attacker ? attacker.id : -1 });
    }
    return 'hit';
  }

  heal(n: number): void {
    this.hp = Math.min(this.maxHp, this.hp + n);
  }

  private updateGhost(dt: number, ctx: SimCtx, it: Intent): void {
    // Los fantasmas humanos vuelan libremente; los de los bots se quedan flotando.
    if (this.human) {
      this.x += it.mx * 95 * dt;
      this.y += it.my * 95 * dt;
      clampToMap(ctx.grid, this, 10);
    }
  }
}
