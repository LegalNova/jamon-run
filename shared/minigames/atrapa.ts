/** ATRAPA LONCHAS: mueve la cesta (← →) y atrapa lonchas; las doradas valen más; ¡ojo con las bombas! */
import { MG } from '../balance';
import { MgDef, MgKey, MgPlayer, MiniGame, rank } from './types';

const A = MG.atrapa;
export type Drop = [number, number, number]; // [tiempo en que llega abajo, carril, tipo 0 loncha / 1 dorada / 2 bomba]

/** Carril de la cesta en el instante t según los cambios. */
export function laneAt(moves: [number, number][], t: number, start: number): number {
  let lane = start;
  for (const [mt, l] of moves) {
    if (mt > t) break;
    lane = l;
  }
  return lane;
}

class Atrapa implements MiniGame {
  readonly id = 'atrapa' as const;
  readonly duration = A.duration;
  t = 0;
  done = false;
  drops: Drop[] = [];
  private ps = new Map<number, { lane: number; moves: [number, number][]; score: number; next: number; got: number[] }>();
  private botSkill = new Map<number, number>();
  private botCd = new Map<number, number>();

  constructor(private players: MgPlayer[], private rng: () => number) {
    for (let t = 1.6; t < A.duration - 0.4; t += A.every) {
      const r = rng();
      this.drops.push([Math.round(t * 100) / 100, Math.floor(rng() * A.lanes), r < 0.13 ? 2 : r < 0.25 ? 1 : 0]);
    }
    const mid = Math.floor(A.lanes / 2);
    for (const p of players) {
      this.ps.set(p.id, { lane: mid, moves: [], score: 0, next: 0, got: [] });
      this.botSkill.set(p.id, 0.55 + rng() * 0.35);
      this.botCd.set(p.id, 0);
    }
  }

  input(id: number, k: MgKey, t: number): void {
    const p = this.ps.get(id);
    if (!p || (k !== 'l' && k !== 'r' && k !== 'a' && k !== 'b')) return;
    const d = k === 'l' || k === 'a' ? -1 : 1;
    p.lane = Math.max(0, Math.min(A.lanes - 1, p.lane + d));
    p.moves.push([t, p.lane]);
  }

  tick(dt: number): void {
    this.t += dt;
    const mid = Math.floor(A.lanes / 2);
    for (const p of this.ps.values()) {
      while (p.next < this.drops.length && this.drops[p.next][0] <= this.t) {
        const [dt0, lane, type] = this.drops[p.next];
        if (laneAt(p.moves, dt0, mid) === lane) {
          p.score += type === 0 ? 1 : type === 1 ? 3 : -3;
          p.got.push(p.next);
        }
        p.next++;
      }
    }
    if (this.t >= this.duration) this.done = true;
  }

  state(): Record<string, unknown> {
    const ps: Record<number, unknown> = {};
    for (const [id, p] of this.ps) ps[id] = { l: p.lane, s: p.score, g: p.got.slice(-6) };
    return { t: this.t, d: this.drops, ps };
  }

  results() {
    return rank(this.players, (id) => this.ps.get(id)!.score, (id) => `${this.ps.get(id)!.score} PUNTOS`);
  }

  bot(id: number, dt: number): MgKey[] {
    const p = this.ps.get(id)!;
    const cd = (this.botCd.get(id) ?? 0) - dt;
    this.botCd.set(id, cd);
    if (cd > 0) return [];
    this.botCd.set(id, 0.12 + (1 - this.botSkill.get(id)!) * 0.3);
    // va hacia la siguiente loncha que no sea bomba
    const target = this.drops.find((d) => d[0] > this.t + 0.1 && d[2] !== 2);
    if (!target || this.rng() > this.botSkill.get(id)!) return [];
    if (target[1] < p.lane) return ['l'];
    if (target[1] > p.lane) return ['r'];
    return [];
  }
}

export const ATRAPA: MgDef = {
  id: 'atrapa',
  name: 'ATRAPA LONCHAS',
  howto: ['MUEVE LA CESTA CON ← →', 'DORADAS +3 · ¡BOMBAS -3!'],
  keys: '← →',
  color: 0xfeae34,
  create: (players, rng) => new Atrapa(players, rng),
};
