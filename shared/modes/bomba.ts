/** JAMÓN BOMBA: patata caliente con mecha oculta, por rondas hasta que queda uno. */
import { HYPE, MODES } from '../balance';
import type { SimChar } from '../sim/Char';
import type { Sim } from '../sim/Sim';
import type { Team } from '../sim/types';
import { BaseMode, ModeNet } from './types';

const M = MODES.bomba;

interface Bomb {
  holder: number;
  fuse: number;
}

export class BombaMode extends BaseMode {
  readonly id = 'bomba' as const;
  readonly itemWeights = null;
  round = 0;
  bombs: Bomb[] = [];
  /** Pausa entre rondas (s). */
  private between = 2.5;

  setup(sim: Sim): void {
    // Aquí no hay equipos: todos contra todos.
    for (const c of sim.chars) {
      c.team = 'escapist';
      c.bomb = false;
    }
  }

  private alive(sim: Sim): SimChar[] {
    return sim.chars.filter((c) => c.alive);
  }

  private startRound(sim: Sim): void {
    const alive = this.alive(sim);
    if (alive.length < 2) return;
    this.round++;
    const n = alive.length > M.twoBombsOver ? 2 : 1;
    const pool = [...alive];
    this.bombs = [];
    const ids: number[] = [];
    for (let k = 0; k < n && pool.length; k++) {
      const c = pool.splice(Math.floor(sim.random() * pool.length), 1)[0];
      c.bomb = true;
      c.lastFrom = -1;
      c.passCd = 0;
      this.bombs.push({ holder: c.id, fuse: M.fuseMin + sim.random() * (M.fuseMax - M.fuseMin) });
      ids.push(c.id);
    }
    for (const c of alive) c.stats.rounds = this.round;
    sim.emit({ t: 'round', n: this.round, ids });
  }

  tick(sim: Sim, dt: number): void {
    for (const c of sim.chars) if (c.alive) c.stats.timeSurvived += dt;
    if (!this.bombs.length) {
      this.between -= dt;
      if (this.between <= 0) this.startRound(sim);
      return;
    }
    for (const b of this.bombs) {
      const h = sim.byId.get(b.holder);
      if (!h || !h.alive) continue;
      b.fuse -= dt;
      if (b.fuse <= 0) {
        this.explode(sim, h);
        b.holder = -1;
        continue;
      }
      // Pasar el jamón tocando a alguien.
      if (h.passCd > M.noReturn - 0.3 || h.stun > 0) continue;
      for (const o of sim.chars) {
        if (o === h || !o.alive || o.bomb) continue;
        if (Math.hypot(o.x - h.x, o.y - h.y) > h.radius + o.radius + M.touch) continue;
        // No se puede devolver al mismo durante unos segundos.
        if (o.id === h.lastFrom && h.passCd > 0) continue;
        if (o.shield) {
          o.shield = false;
          o.invuln = 0.5;
          h.passCd = M.noReturn - 0.2;
          o.stats.blocks++;
          const d = Math.hypot(o.x - h.x, o.y - h.y) || 1;
          sim.emit({ t: 'block', v: o.id, nx: (o.x - h.x) / d, ny: (o.y - h.y) / d });
          break;
        }
        h.bomb = false;
        o.bomb = true;
        o.lastFrom = h.id;
        o.passCd = M.noReturn;
        o.stun = 0.15;
        // Empujón para separarlos.
        const d = Math.hypot(o.x - h.x, o.y - h.y) || 1;
        o.kbx = ((o.x - h.x) / d) * 90;
        o.kby = ((o.y - h.y) / d) * 90;
        h.stats.passes++;
        b.holder = o.id;
        sim.emit({ t: 'pass', from: h.id, to: o.id });
        if (b.fuse < 3) sim.award(h.id, HYPE.coins.closeCall, true);
        break;
      }
    }
    this.bombs = this.bombs.filter((b) => b.holder >= 0);
    if (!this.bombs.length) {
      this.between = M.between;
      for (const c of this.alive(sim)) sim.award(c.id, HYPE.coins.roundSurvived, false);
    }
  }

  private explode(sim: Sim, h: SimChar): void {
    sim.emit({ t: 'boom', id: h.id, x: Math.round(h.x), y: Math.round(h.y) });
    // La onda expansiva empuja a los que están cerca.
    for (const o of sim.chars) {
      if (o === h || !o.alive) continue;
      const d = Math.hypot(o.x - h.x, o.y - h.y);
      if (d > 48 || d < 0.01) continue;
      o.kbx += ((o.x - h.x) / d) * 220 * (1 - d / 48);
      o.kby += ((o.y - h.y) / d) * 220 * (1 - d / 48);
    }
    h.bomb = false;
    h.knockOut(sim, h.lastFrom);
  }

  isHunter(c: SimChar): boolean {
    return c.bomb;
  }

  canHit(): boolean {
    return false;
  }

  checkEnd(sim: Sim): void {
    const alive = this.alive(sim);
    if (alive.length <= 1) sim.end('escapist', alive[0]?.id ?? -1);
  }

  net(sim: Sim, out: ModeNet): void {
    out.r = this.round;
    out.ph = this.bombs.length ? 0 : 1;
    out.pt = this.bombs.length ? 0 : Math.max(0, Math.round(this.between * 10));
    out.b = [];
    for (const b of this.bombs) out.b.push(b.holder, b.fuse > 8 ? 0 : b.fuse > 3.5 ? 1 : 2);
    out.n = this.alive(sim).length;
    out.tot = sim.chars.length;
  }

  finish(sim: Sim, _winner: Team): void {
    let best: SimChar | null = null;
    for (const c of sim.chars) if (c.stats.passes >= 3 && (!best || c.stats.passes > best.stats.passes)) best = c;
    if (best) sim.medal(best, 'PATATA CALIENTE');
    const champ = sim.byId.get(sim.champion);
    if (champ) sim.medal(champ, 'ÚLTIMO EN PIE');
  }
}
