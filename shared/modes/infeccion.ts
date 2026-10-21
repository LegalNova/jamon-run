/** INFECCIÓN: un infectado al azar; si te toca, te conviertes. */
import { BALANCE, HYPE, MODES, TILE } from '../balance';
import type { SimChar } from '../sim/Char';
import type { Sim } from '../sim/Sim';
import type { PickupType, Team } from '../sim/types';
import { BaseMode, ModeNet } from './types';

const M = MODES.infeccion;

export class InfeccionMode extends BaseMode {
  readonly id = 'infeccion' as const;
  readonly itemWeights = M.itemWeights;
  private lastId = -1;
  private pingTimer = 0;
  private ping: number[] = [];
  private surviveTimer: number = HYPE.surviveEvery;

  setup(sim: Sim): void {
    for (const c of sim.chars) if (c.team === 'chaser') this.makeInfected(c);
  }

  private makeInfected(c: SimChar): void {
    c.team = 'chaser';
    c.maxHp = c.hp = BALANCE.escapist.maxHp;
    c.heldItem = null;
    c.shield = false;
    c.bootTime = 0;
    c.dashFree = 0;
  }

  survivors(sim: Sim): SimChar[] {
    return sim.chars.filter((c) => c.alive && c.team === 'escapist');
  }

  tick(sim: Sim, dt: number): void {
    const infected = sim.chars.filter((c) => c.alive && c.team === 'chaser');
    const surv = this.survivors(sim);
    for (const s of surv) s.stats.timeSurvived += dt;

    if (sim.canMoveTeam('chaser')) {
      for (const z of infected) {
        if (z.stun > 0) continue;
        for (const s of surv) {
          if (s.team !== 'escapist') continue;
          if (Math.hypot(s.x - z.x, s.y - z.y) > z.radius + s.radius + M.touch) continue;
          if (s.dashing) {
            // Esquiva in extremis.
            if (s.invuln <= 0) {
              s.invuln = 0.4;
              s.stats.dodges++;
              sim.emit({ t: 'dodge', v: s.id });
            }
            continue;
          }
          if (s.invuln > 0) continue;
          if (s.shield) {
            s.shield = false;
            s.invuln = 1;
            s.stats.blocks++;
            const d = Math.hypot(s.x - z.x, s.y - z.y) || 1;
            s.kbx = ((s.x - z.x) / d) * 160;
            s.kby = ((s.y - z.y) / d) * 160;
            sim.emit({ t: 'block', v: s.id, nx: (s.x - z.x) / d, ny: (s.y - z.y) / d });
            continue;
          }
          this.infect(sim, s, z);
        }
      }
    }

    // Monedas por seguir vivo.
    this.surviveTimer -= dt;
    if (this.surviveTimer <= 0) {
      this.surviveTimer = HYPE.surviveEvery;
      for (const s of this.survivors(sim)) sim.award(s.id, HYPE.coins.surviveTick, false);
    }

    // El último superviviente aparece en el radar de los infectados.
    const left = this.survivors(sim);
    if (left.length === 1 && sim.chars.length > 2) {
      const last = left[0];
      if (this.lastId !== last.id) {
        this.lastId = last.id;
        this.pingTimer = 0;
        sim.emit({ t: 'last', id: last.id });
        sim.award(last.id, HYPE.coins.lastSurvivor, false);
      }
      this.pingTimer -= dt;
      if (this.pingTimer <= 0) {
        this.pingTimer = M.lastPing;
        this.ping = [Math.round(last.x), Math.round(last.y)];
      }
    } else {
      this.ping = [];
    }
  }

  infect(sim: Sim, s: SimChar, by: SimChar | null): void {
    this.makeInfected(s);
    // El recién infectado tarda un poco en "despertar".
    s.stun = 1.2;
    s.invuln = 0;
    s.vx = s.vy = 0;
    s.dashTime = 0;
    if (by) {
      by.stats.infections++;
      by.stats.eliminations++;
    }
    s.stats.hitsTaken++;
    sim.emit({ t: 'infect', v: s.id, a: by ? by.id : -1 });
  }

  isHunter(c: SimChar): boolean {
    return c.team === 'chaser';
  }

  canHit(): boolean {
    return false;
  }

  onDowned(sim: Sim, v: SimChar, a: SimChar | null): void {
    if (v.team === 'escapist') this.infect(sim, v, a);
  }

  canPickup(c: SimChar, type: PickupType): boolean {
    if (c.team !== 'escapist') return false;
    if (type === 'boot') return true;
    return c.heldItem === null;
  }

  onPickup(_sim: Sim, c: SimChar, type: PickupType): void {
    if (type === 'boot') c.bootTime = BALANCE.items.bootDuration;
    else c.heldItem = type;
  }

  useItem(sim: Sim, c: SimChar): void {
    const it = c.heldItem;
    if (!it) return;
    c.heldItem = null;
    if (it === 'grenade') {
      sim.dropSmoke(c.x, c.y);
    } else if (it === 'barrier') {
      // Barrera detrás de ti, perpendicular a hacia donde corres: tapa el pasillo.
      const g = sim.grid;
      const bx = c.x - c.fx * TILE * 1.4;
      const by = c.y - c.fy * TILE * 1.4;
      const horiz = Math.abs(c.fy) > Math.abs(c.fx);
      const half = Math.floor(M.barrierLength / 2);
      const tiles: number[] = [];
      const cx = Math.floor(bx / TILE);
      const cy = Math.floor(by / TILE);
      for (let k = -half; k <= half; k++) {
        const tx = horiz ? cx + k : cx;
        const ty = horiz ? cy : cy + k;
        if (!g.walkable(tx, ty)) continue;
        const i = g.idx(tx, ty);
        // No encerrar a nadie dentro de la barrera.
        if (sim.chars.some((o) => o.alive && g.tileOf(o.x, o.y) === i)) continue;
        tiles.push(i);
      }
      sim.barrier(tiles, M.barrierSeconds);
    }
  }

  checkEnd(sim: Sim): void {
    const left = this.survivors(sim);
    if (left.length === 0) sim.end('chaser');
    else if (sim.timeLeft <= 0) sim.end('escapist', left.length === 1 ? left[0].id : -1);
  }

  net(sim: Sim, out: ModeNet): void {
    out.n = this.survivors(sim).length;
    out.tot = sim.chars.length;
    out.pg = this.ping;
  }

  finish(sim: Sim, winner: Team): void {
    const left = this.survivors(sim);
    if (winner === 'escapist' && left.length === 1) sim.medal(left[0], 'LEYENDA');
    for (const c of sim.chars) {
      if (c.stats.infections >= 3) sim.medal(c, 'PACIENTE CERO');
      if (winner === 'escapist' && c.alive && c.team === 'escapist' && left.length > 1) sim.medal(c, 'SUPERVIVIENTE');
    }
  }
}
