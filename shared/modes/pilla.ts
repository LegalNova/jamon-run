/** PILLA JAMÓN: el modo clásico (sin cambios de reglas). */
import { BALANCE, HYPE, RESCUE } from '../balance';
import type { SimChar } from '../sim/Char';
import type { Sim } from '../sim/Sim';
import type { PickupType, Team } from '../sim/types';
import { BaseMode, ModeNet } from './types';

export class PillaMode extends BaseMode {
  readonly id = 'pilla' as const;
  readonly itemWeights = { medkit: BALANCE.items.weights.medkit, boot: BALANCE.items.weights.boot, shield: BALANCE.items.weights.shield, gold: BALANCE.items.weights.gold };
  private surviveTimer: number = HYPE.surviveEvery;

  tick(sim: Sim, dt: number): void {
    for (const c of sim.chars) if (c.free && !c.isChaser) c.stats.timeSurvived += dt;
    this.updateRescues(sim, dt);
    this.surviveTimer -= dt;
    if (this.surviveTimer <= 0) {
      this.surviveTimer = HYPE.surviveEvery;
      for (const c of sim.chars) if (c.free && !c.isChaser) sim.award(c.id, HYPE.coins.surviveTick, false);
    }
  }

  onDowned(sim: Sim, v: SimChar, a: SimChar | null): void {
    v.trap(sim, a ? a.id : -1);
  }

  canPickup(c: SimChar, type: PickupType): boolean {
    if (c.isChaser) return type === 'boot';
    if (type === 'medkit') return c.hp < c.maxHp;
    if (type === 'shield') return !c.shield;
    return true;
  }

  onPickup(sim: Sim, c: SimChar, type: PickupType): void {
    if (type === 'medkit') c.heal(BALANCE.items.medkitHeal);
    else if (type === 'boot') c.bootTime = BALANCE.items.bootDuration;
    else if (type === 'shield') c.shield = true;
    else if (type === 'gold') {
      // Jamón de oro: libera a todos los compañeros atrapados.
      for (const t of sim.chars) {
        if (t.trapped > 0 && !t.isChaser) {
          t.release();
          c.stats.rescues++;
          sim.emit({ t: 'rescue', v: t.id, by: c.id });
        }
      }
      sim.say(c.id, 22);
    }
  }

  meleeDamage(): number {
    return BALANCE.chaser.attackDamage;
  }

  /** Rojos atrapados: se liberan si un compañero se queda a su lado; si no, quedan fuera. */
  private updateRescues(sim: Sim, dt: number): void {
    for (const c of sim.chars) {
      if (c.trapped <= 0) continue;
      c.trapped -= dt;
      let rescuer: SimChar | null = null;
      for (const o of sim.chars) {
        if (o === c || o.isChaser || !o.free) continue;
        if (Math.hypot(o.x - c.x, o.y - c.y) <= RESCUE.radius) {
          rescuer = o;
          break;
        }
      }
      if (rescuer) c.rescueProg += dt / RESCUE.rescueTime;
      else c.rescueProg = Math.max(0, c.rescueProg - RESCUE.decay * dt);
      if (rescuer && c.rescueProg >= 1) {
        c.release();
        rescuer.stats.rescues++;
        sim.emit({ t: 'rescue', v: c.id, by: rescuer.id });
      } else if (c.trapped <= 0) {
        c.knockOut(sim, c.trappedBy);
      }
    }
  }

  checkEnd(sim: Sim): void {
    const aliveEsc = sim.chars.some((c) => c.free && !c.isChaser);
    if (!aliveEsc) sim.end('chaser');
    else if (sim.timeLeft <= 0) sim.end('escapist');
  }

  net(sim: Sim, out: ModeNet): void {
    out.n = sim.chars.filter((c) => c.free && !c.isChaser).length;
    out.tot = sim.chars.filter((c) => !c.isChaser).length;
  }

  finish(sim: Sim, winner: Team): void {
    for (const c of sim.chars) {
      if (!c.isChaser && c.alive && c.stats.hitsTaken === 0 && winner === 'escapist') sim.medal(c, 'INTOCABLE');
      if (c.stats.rescues >= 2) sim.medal(c, 'SALVAVIDAS');
      if (c.isChaser && c.stats.eliminations >= 3) sim.medal(c, 'CARNICERO');
      if (c.stats.dodges >= 3) sim.medal(c, 'ESCURRIDIZO');
    }
  }
}
