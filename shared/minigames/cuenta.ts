/** CUENTA JAMONES: cuenta los jamones que cruzan (¡no las lonchas!) y elige el número correcto. */
import { MG } from '../balance';
import { MgDef, MgKey, MgPlayer, MiniGame, rank } from './types';

const C = MG.cuenta;

interface Round {
  start: number;
  /** [instante, altura 0..1, tipo 0 jamón / 1 loncha (no cuenta)] */
  items: [number, number, number][];
  answer: number;
  options: number[];
}

export function roundTimes(r: Round): { pick: number; end: number } {
  const pick = r.start + C.show;
  return { pick, end: pick + C.pick + C.reveal };
}

class Cuenta implements MiniGame {
  readonly id = 'cuenta' as const;
  readonly duration: number;
  t = 0;
  done = false;
  private rounds: Round[] = [];
  private cur = 0;
  private ps = new Map<number, { sel: number; locked: boolean; score: number; hits: number }>();
  private botAt = new Map<number, number>();

  constructor(private players: MgPlayer[], private rng: () => number) {
    let start = 0.3;
    for (let i = 0; i < C.rounds; i++) {
      const n = C.min[i] + Math.floor(rng() * (C.max[i] - C.min[i] + 1));
      const decoys = 2 + i * 2;
      const items: [number, number, number][] = [];
      for (let k = 0; k < n + decoys; k++) items.push([Math.round((start + 0.2 + rng() * (C.show - 1.4)) * 100) / 100, Math.round(rng() * 100) / 100, k < n ? 0 : 1]);
      items.sort((a, b) => a[0] - b[0]);
      const opts = new Set<number>([n]);
      while (opts.size < 3) opts.add(Math.max(1, n + Math.floor(rng() * 7) - 3));
      const options = [...opts].sort(() => rng() - 0.5);
      const r: Round = { start, items, answer: n, options };
      this.rounds.push(r);
      start = roundTimes(r).end;
    }
    this.duration = start;
    for (const p of players) {
      this.ps.set(p.id, { sel: 1, locked: false, score: 0, hits: 0 });
      this.botAt.set(p.id, 0.6 + rng());
    }
  }

  input(id: number, k: MgKey, t: number): void {
    const p = this.ps.get(id);
    const r = this.rounds[this.cur];
    if (!p || !r || p.locked) return;
    const rt = roundTimes(r);
    if (t < rt.pick || t >= rt.pick + C.pick) return;
    if (k === 'l') p.sel = (p.sel + 2) % 3;
    else if (k === 'r') p.sel = (p.sel + 1) % 3;
    else {
      p.locked = true;
      if (r.options[p.sel] === r.answer) {
        p.hits++;
        p.score += 100 + Math.round((1 - (t - rt.pick) / C.pick) * 50);
      }
    }
  }

  tick(dt: number): void {
    this.t += dt;
    const r = this.rounds[this.cur];
    if (r && this.t >= roundTimes(r).end) {
      this.cur++;
      for (const p of this.ps.values()) {
        p.locked = false;
        p.sel = 1;
      }
    }
    if (this.cur >= this.rounds.length) this.done = true;
  }

  state(): Record<string, unknown> {
    const r = this.rounds[Math.min(this.cur, this.rounds.length - 1)];
    const rt = roundTimes(r);
    const ps: Record<number, unknown> = {};
    for (const [id, p] of this.ps) ps[id] = { s: p.sel, l: p.locked, sc: p.score };
    // Solo los jamones que ya han salido; la respuesta, al final de la ronda.
    return { t: this.t, r: this.cur, st: r.start, it: r.items.filter((i) => i[0] <= this.t + 0.05), op: this.t >= rt.pick ? r.options : [], ans: this.t >= rt.pick + C.pick ? r.answer : -1, ps };
  }

  results() {
    return rank(this.players, (id) => this.ps.get(id)!.score, (id) => `${this.ps.get(id)!.hits}/${C.rounds} ACIERTOS`);
  }

  bot(id: number, dt: number): MgKey[] {
    const r = this.rounds[this.cur];
    const p = this.ps.get(id)!;
    if (!r || p.locked) return [];
    const rt = roundTimes(r);
    if (this.t < rt.pick) return [];
    const w = (this.botAt.get(id) ?? 1) - dt;
    this.botAt.set(id, w);
    if (w > 0) return [];
    this.botAt.set(id, 0.3 + this.rng() * 0.8);
    const target = this.rng() < 0.6 ? r.options.indexOf(r.answer) : Math.floor(this.rng() * 3);
    if (p.sel === target) return ['a'];
    return ['r'];
  }
}

export const CUENTA: MgDef = {
  id: 'cuenta',
  name: 'CUENTA JAMONES',
  howto: ['CUENTA LOS JAMONES (NO LAS LONCHAS)', '← → ELIGE · ESPACIO CONFIRMA'],
  keys: '← → · ESPACIO',
  color: 0x9ae6ff,
  create: (players, rng) => new Cuenta(players, rng),
};
