/** TORRE DE LONCHAS: la loncha va de lado a lado; al pulsar cae y lo que sobresale se corta. */
import { MG } from '../balance';
import { MgDef, MgKey, MgPlayer, MiniGame, pingpong, rank } from './types';

const T = MG.torre;

/** Posición del centro de la loncha que se mueve (-1..1). */
export function slabAt(t: number, h: number, t0: number): number {
  const period = Math.max(T.minPeriod, T.period - h * T.step);
  return pingpong((t - t0) / period) * 2 - 1;
}

interface P {
  h: number;
  /** centro y ancho de la loncha de arriba */
  x: number;
  w: number;
  t0: number;
  over: boolean;
  /** lonchas colocadas [x, w] (para dibujar) */
  st: number[][];
  perf: number;
}

class Torre implements MiniGame {
  readonly id = 'torre' as const;
  readonly duration = T.duration;
  t = 0;
  done = false;
  private ps = new Map<number, P>();

  constructor(private players: MgPlayer[], private rng: () => number) {
    for (const p of players) this.ps.set(p.id, { h: 0, x: 0, w: 0.9, t0: 0, over: false, st: [[0, 0.9]], perf: 0 });
  }

  input(id: number, k: MgKey, t: number): void {
    const p = this.ps.get(id);
    if (!p || k !== 'a' || p.over || t >= this.duration) return;
    let x = slabAt(t, p.h, p.t0);
    const off = x - p.x;
    let w = p.w - Math.abs(off);
    if (Math.abs(off) < T.perfect) {
      // ¡Perfecta! Encaja y no pierde nada.
      x = p.x;
      w = p.w;
      p.perf++;
    } else {
      x = p.x + off / 2;
    }
    if (w <= 0.02) {
      p.over = true;
      return;
    }
    p.h++;
    p.x = x;
    p.w = w;
    p.t0 = t;
    p.st.push([Math.round(x * 1000) / 1000, Math.round(w * 1000) / 1000]);
  }

  tick(dt: number): void {
    this.t += dt;
    const all = [...this.ps.values()].every((p) => p.over);
    if (this.t >= this.duration || all) this.done = true;
  }

  state(): Record<string, unknown> {
    const ps: Record<number, unknown> = {};
    for (const [id, p] of this.ps) ps[id] = { h: p.h, t0: p.t0, o: p.over, st: p.st.slice(-8), x: p.x, w: p.w };
    return { t: this.t, ps };
  }

  results() {
    return rank(this.players, (id) => this.ps.get(id)!.h * 1000 + Math.round(this.ps.get(id)!.w * 100), (id) => `${this.ps.get(id)!.h} PISOS`);
  }

  bot(id: number, _dt: number): MgKey[] {
    const p = this.ps.get(id)!;
    if (p.over || this.t - p.t0 < 0.3) return [];
    const x = slabAt(this.t, p.h, p.t0);
    const err = 0.03 + p.h * 0.012;
    return Math.abs(x - p.x) < err && this.rng() < 0.6 ? ['a'] : [];
  }
}

export const TORRE: MgDef = {
  id: 'torre',
  name: 'TORRE DE LONCHAS',
  howto: ['PULSA PARA SOLTAR LA LONCHA', 'LO QUE SOBRESALE SE CAE'],
  keys: 'ESPACIO',
  color: 0xfee761,
  create: (players, rng) => new Torre(players, rng),
};
