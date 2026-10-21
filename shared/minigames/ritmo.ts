/** RITMO JAMONERO: flechas que caen al ritmo; ← / ESPACIO carril izquierdo, → / E carril derecho. */
import { MG } from '../balance';
import { MgDef, MgKey, MgPlayer, MiniGame, rank } from './types';

const M = MG.ritmo;
export const BEAT = 60 / M.bpm;

interface P {
  hit: Uint8Array;
  score: number;
  combo: number;
  best: number;
  last: string;
  lastT: number;
  next: number;
}

class Ritmo implements MiniGame {
  readonly id = 'ritmo' as const;
  readonly duration = M.duration;
  t = 0;
  done = false;
  /** [tiempo, carril] */
  notes: [number, number][] = [];
  private ps = new Map<number, P>();
  private botSkill = new Map<number, number>();
  private botNote = new Map<number, number>();

  constructor(private players: MgPlayer[], private rng: () => number) {
    // Patrón de 2 compases que se repite con variaciones (corcheas y negras).
    let t = 1.6;
    while (t < M.duration - 0.8) {
      const dense = t > M.duration * 0.5;
      const step = rng() < (dense ? 0.55 : 0.3) ? BEAT / 2 : BEAT;
      this.notes.push([Math.round(t * 1000) / 1000, rng() < 0.5 ? 0 : 1]);
      t += step;
    }
    for (const p of players) {
      this.ps.set(p.id, { hit: new Uint8Array(this.notes.length), score: 0, combo: 0, best: 0, last: '', lastT: -9, next: 0 });
      this.botSkill.set(p.id, 0.55 + rng() * 0.35);
    }
  }

  input(id: number, k: MgKey, t: number): void {
    const p = this.ps.get(id);
    if (!p) return;
    const lane = k === 'l' || k === 'a' ? 0 : 1;
    let best = -1;
    let bd = Infinity;
    for (let i = p.next; i < this.notes.length; i++) {
      const [nt, nl] = this.notes[i];
      if (nt - t > M.good) break;
      if (nl !== lane || p.hit[i]) continue;
      const d = Math.abs(nt - t);
      if (d <= M.good && d < bd) {
        bd = d;
        best = i;
      }
    }
    if (best < 0) return;
    p.hit[best] = 1;
    const perfect = bd <= M.perfect;
    p.combo++;
    p.best = Math.max(p.best, p.combo);
    const mult = Math.min(2, 1 + p.combo * 0.05);
    p.score += Math.round((perfect ? 300 : 100) * mult);
    p.last = perfect ? 'PERFECTO' : 'BIEN';
    p.lastT = t;
  }

  tick(dt: number): void {
    this.t += dt;
    // Notas que se pasan sin tocar: se rompe el combo.
    for (const p of this.ps.values()) {
      while (p.next < this.notes.length && this.notes[p.next][0] < this.t - M.good) {
        if (!p.hit[p.next]) {
          p.combo = 0;
          p.last = 'FALLO';
          p.lastT = this.t;
        }
        p.next++;
      }
    }
    if (this.t >= this.duration) this.done = true;
  }

  state(): Record<string, unknown> {
    const ps: Record<number, unknown> = {};
    for (const [id, p] of this.ps) ps[id] = { sc: p.score, c: p.combo, l: p.last, lt: p.lastT, h: Array.from(p.hit.slice(Math.max(0, p.next - 4), p.next + 12)), o: Math.max(0, p.next - 4) };
    return { t: this.t, notes: this.notes, ps };
  }

  results() {
    return rank(this.players, (id) => this.ps.get(id)!.score, (id) => `${this.ps.get(id)!.score} · COMBO ${this.ps.get(id)!.best}`);
  }

  bot(id: number, _dt: number): MgKey[] {
    const p = this.ps.get(id)!;
    const out: MgKey[] = [];
    for (let i = p.next; i < this.notes.length; i++) {
      const [nt, nl] = this.notes[i];
      if (nt > this.t + 0.02) break;
      // Cada bot decide una vez por nota si la toca y con cuánto error.
      if (p.hit[i] || this.botNote.get(id) === i) continue;
      const jitter = (this.rng() - 0.3) * 0.12;
      if (this.t >= nt + jitter - 0.02) {
        this.botNote.set(id, i);
        if (this.rng() < this.botSkill.get(id)!) out.push(nl === 0 ? 'l' : 'r');
      }
    }
    return out;
  }
}

export const RITMO: MgDef = {
  id: 'ritmo',
  name: 'RITMO JAMONERO',
  howto: ['PULSA CUANDO LA FLECHA LLEGUE', '← O ESPACIO · → O E'],
  keys: '← → (O ESPACIO / E)',
  color: 0xb55088,
  create: (players, rng) => new Ritmo(players, rng),
};
