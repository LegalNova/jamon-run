/** CORTA EL JAMÓN: el cuchillo va y viene; pulsa cuando pase por la marca para la loncha más fina. */
import { MG } from '../balance';
import { MgDef, MgKey, MgPlayer, MiniGame, pingpong, rank } from './types';

const K = MG.corta;

export function cutGrade(acc: number): string {
  return acc >= 0.93 ? 'PERFECTO' : acc >= 0.75 ? 'GENIAL' : acc >= 0.45 ? 'BIEN' : 'GORDA';
}

/** Posición del cuchillo (0..1) con n cortes hechos y el último a t0. */
export function knifeAt(t: number, n: number, t0: number): number {
  const period = Math.max(0.45, K.period - n * K.periodStep);
  return pingpong((t - t0) / period);
}

interface P {
  n: number;
  t0: number;
  cd: number;
  acc: number[];
  botAim: number;
}

class Corta implements MiniGame {
  readonly id = 'corta' as const;
  readonly duration = K.duration;
  t = 0;
  done = false;
  private ps = new Map<number, P>();

  constructor(private players: MgPlayer[], private rng: () => number) {
    for (const p of players) this.ps.set(p.id, { n: 0, t0: 0, cd: 0, acc: [], botAim: (rng() - 0.5) * 0.25 });
  }

  input(id: number, k: MgKey, t: number): void {
    const p = this.ps.get(id);
    if (!p || k !== 'a' || p.n >= K.cuts || t < p.cd) return;
    const pos = knifeAt(t, p.n, p.t0);
    const acc = Math.max(0, 1 - Math.abs(pos - 0.5) * 2.4);
    p.acc.push(Math.round(acc * 100) / 100);
    p.n++;
    p.t0 = t;
    p.cd = t + K.cooldown;
  }

  tick(dt: number): void {
    this.t += dt;
    const allDone = [...this.ps.values()].every((p) => p.n >= K.cuts);
    if (this.t >= this.duration || (allDone && this.t > 1)) this.done = true;
  }

  state(): Record<string, unknown> {
    const ps: Record<number, unknown> = {};
    for (const [id, p] of this.ps) ps[id] = { n: p.n, t0: p.t0, a: p.acc };
    return { t: this.t, ps };
  }

  private score(id: number): number {
    return Math.round(this.ps.get(id)!.acc.reduce((a, b) => a + b, 0) * 100);
  }

  results() {
    const res = rank(this.players, (id) => this.score(id), (id) => `${this.score(id)} PUNTOS`);
    for (const r of res) r.perfects = this.ps.get(r.id)!.acc.filter((a) => a >= 0.93).length;
    return res;
  }

  bot(id: number, _dt: number): MgKey[] {
    const p = this.ps.get(id)!;
    if (p.n >= K.cuts || this.t < p.cd || this.t < 0.6) return [];
    const pos = knifeAt(this.t, p.n, p.t0);
    if (Math.abs(pos - (0.5 + p.botAim)) < 0.04) {
      p.botAim = (this.rng() - 0.5) * 0.3;
      return ['a'];
    }
    return [];
  }
}

export const CORTA: MgDef = {
  id: 'corta',
  name: 'CORTA EL JAMÓN',
  howto: ['PULSA CUANDO EL CUCHILLO', 'PASE POR LA MARCA · 5 CORTES'],
  keys: 'ESPACIO',
  color: 0xff7ab8,
  create: (players, rng) => new Corta(players, rng),
};
