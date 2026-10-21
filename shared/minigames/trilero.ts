/**
 * TRILERO DEL JAMÓN: 3, luego 4 y luego 5 cubiletes; uno esconde la loncha dorada.
 * La mezcla es justa y se puede seguir con la vista (los cambios se ven tal cual ocurren).
 */
import { MG } from '../balance';
import { MgDef, MgKey, MgPlayer, MiniGame, rank } from './types';

const T = MG.trilero;

interface Round {
  n: number;
  start: number;
  ham: number;
  swaps: [number, number][];
  swapTime: number;
}

export function roundTimes(r: Round): { shuffle: number; pick: number; reveal: number; end: number } {
  const shuffle = r.start + T.show;
  const pick = shuffle + r.swaps.length * r.swapTime;
  const reveal = pick + T.pick;
  return { shuffle, pick, reveal, end: reveal + T.reveal };
}

/** Qué cubilete (id) hay en cada hueco tras aplicar los cambios hasta el instante t. */
export function slotsAt(r: Round, t: number): { slots: number[]; moving: [number, number, number] | null } {
  const slots = Array.from({ length: r.n }, (_, i) => i);
  const { shuffle } = roundTimes(r);
  let moving: [number, number, number] | null = null;
  for (let k = 0; k < r.swaps.length; k++) {
    const s0 = shuffle + k * r.swapTime;
    if (t < s0) break;
    const [a, b] = r.swaps[k];
    if (t < s0 + r.swapTime) {
      moving = [a, b, (t - s0) / r.swapTime];
      break;
    }
    [slots[a], slots[b]] = [slots[b], slots[a]];
  }
  return { slots, moving };
}

class Trilero implements MiniGame {
  readonly id = 'trilero' as const;
  readonly duration: number;
  t = 0;
  done = false;
  private rounds: Round[] = [];
  private cur = 0;
  private ps = new Map<number, { sel: number; locked: boolean; score: number; hits: number }>();
  private botAt = new Map<number, number>();
  private botTarget = new Map<number, number>();

  constructor(private players: MgPlayer[], private rng: () => number) {
    let start = 0;
    T.cups.forEach((n, i) => {
      const swaps: [number, number][] = [];
      for (let k = 0; k < T.swaps[i]; k++) {
        const a = Math.floor(rng() * n);
        let b = Math.floor(rng() * (n - 1));
        if (b >= a) b++;
        swaps.push([a, b]);
      }
      const r: Round = { n, start, ham: Math.floor(rng() * n), swaps, swapTime: T.swapTime[i] };
      this.rounds.push(r);
      start = roundTimes(r).end;
    });
    this.duration = start;
    for (const p of players) {
      this.ps.set(p.id, { sel: 0, locked: false, score: 0, hits: 0 });
      this.botAt.set(p.id, 0.5 + rng() * 1.5);
    }
  }

  private round(): Round {
    return this.rounds[this.cur];
  }

  input(id: number, k: MgKey, t: number): void {
    const p = this.ps.get(id);
    const r = this.round();
    if (!p || !r) return;
    const rt = roundTimes(r);
    if (t < rt.pick || t >= rt.reveal || p.locked) return;
    if (k === 'l') p.sel = (p.sel + r.n - 1) % r.n;
    else if (k === 'r') p.sel = (p.sel + 1) % r.n;
    else if (k === 'a' || k === 'b') {
      p.locked = true;
      const { slots } = slotsAt(r, rt.pick);
      if (slots[p.sel] === r.ham) {
        p.hits++;
        // Más puntos si aciertas rápido.
        p.score += 100 + Math.round((1 - (t - rt.pick) / T.pick) * 50);
      }
    }
  }

  tick(dt: number): void {
    this.t += dt;
    const r = this.round();
    if (r && this.t >= roundTimes(r).end) {
      this.cur++;
      for (const p of this.ps.values()) {
        p.locked = false;
        p.sel = 0;
      }
    }
    if (this.cur >= this.rounds.length) this.done = true;
  }

  state(): Record<string, unknown> {
    const r = this.round() ?? this.rounds[this.rounds.length - 1];
    const rt = roundTimes(r);
    const showHam = this.t < rt.shuffle || this.t >= rt.reveal;
    const ps: Record<number, unknown> = {};
    for (const [id, p] of this.ps) ps[id] = { s: p.sel, l: p.locked, sc: p.score, h: p.hits };
    // Solo los cambios que ya han empezado: no se adelanta nada.
    const visible = r.swaps.filter((_, k) => this.t >= rt.shuffle + k * r.swapTime);
    return { t: this.t, r: this.cur, n: r.n, st: r.start, sw: visible, swt: r.swapTime, ns: r.swaps.length, ham: showHam ? r.ham : -1, ps };
  }

  results() {
    return rank(this.players, (id) => this.ps.get(id)!.score, (id) => `${this.ps.get(id)!.hits}/${T.cups.length} ACIERTOS`);
  }

  bot(id: number, dt: number): MgKey[] {
    const r = this.round();
    const p = this.ps.get(id)!;
    if (!r || p.locked) return [];
    const rt = roundTimes(r);
    if (this.t < rt.pick) return [];
    const w = (this.botAt.get(id) ?? 1) - dt;
    this.botAt.set(id, w);
    if (w > 0) return [];
    this.botAt.set(id, 0.3 + this.rng() * 1.2);
    const { slots } = slotsAt(r, rt.pick);
    const skill = [0.85, 0.7, 0.55][this.cur] ?? 0.5;
    const key = id * 10 + this.cur;
    if (!this.botTarget.has(key)) this.botTarget.set(key, this.rng() < skill ? slots.indexOf(r.ham) : Math.floor(this.rng() * r.n));
    const target = this.botTarget.get(key)!;
    if (p.sel === target) return ['a'];
    return [p.sel < target ? 'r' : 'l'];
  }
}

export const TRILERO: MgDef = {
  id: 'trilero',
  name: 'TRILERO DEL JAMÓN',
  howto: ['SIGUE EL CUBILETE DE LA LONCHA', '← → ELEGIR · ESPACIO CONFIRMAR'],
  keys: '← → · ESPACIO',
  color: 0xffd23f,
  create: (players, rng) => new Trilero(players, rng),
};
