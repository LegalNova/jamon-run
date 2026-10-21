/** TIRA Y AFLOJA: azules contra rojos. Pulsa AL RITMO del indicador (machacar a lo loco no sirve). */
import { MG } from '../balance';
import { MgDef, MgKey, MgPlayer, MgResult, MiniGame } from './types';

const A = MG.tira;

/** Calidad de un tirón según lo cerca que esté del pulso (0 = fuera de ritmo, 1 = cerca, 3 = perfecto). */
export function pullAt(t: number): number {
  const ph = t / A.beat;
  const d = Math.abs(ph - Math.round(ph)) * A.beat;
  return d <= A.window ? 3 : d <= A.near ? 1 : 0;
}

class Tira implements MiniGame {
  readonly id = 'tira' as const;
  readonly duration = A.duration;
  t = 0;
  done = false;
  rope = 0;
  private side = new Map<number, number>();
  private size = [0, 0];
  private pulls = new Map<number, number>();
  private lastBeat = new Map<number, number>();
  private winner = -1;
  private botPhase = new Map<number, number>();

  constructor(private players: MgPlayer[], private rng: () => number) {
    const mixed = new Set(players.map((p) => p.team)).size > 1;
    players.forEach((p, i) => {
      const s = mixed ? (p.team === 'chaser' ? 0 : 1) : i % 2;
      this.side.set(p.id, s);
      this.size[s]++;
      this.pulls.set(p.id, 0);
      this.botPhase.set(p.id, (rng() - 0.5) * 0.16);
    });
  }

  input(id: number, k: MgKey, t: number): void {
    if (k !== 'a' || this.winner >= 0 || !this.side.has(id)) return;
    const beat = Math.round(t / A.beat);
    if (this.lastBeat.get(id) === beat) return;
    this.lastBeat.set(id, beat);
    const pull = pullAt(t);
    if (!pull) return;
    const s = this.side.get(id)!;
    this.pulls.set(id, this.pulls.get(id)! + pull);
    // Se divide por el tamaño del equipo: un equipo pequeño no está en desventaja.
    this.rope += (s === 0 ? -1 : 1) * pull * 0.012 * (4 / Math.max(1, this.size[s]));
    if (Math.abs(this.rope) >= A.winAt) this.winner = this.rope < 0 ? 0 : 1;
  }

  tick(dt: number): void {
    this.t += dt;
    if (this.winner >= 0 && !this.done) this.done = true;
    if (this.t >= this.duration) {
      if (this.winner < 0) this.winner = this.rope < 0 ? 0 : 1;
      this.done = true;
    }
  }

  state(): Record<string, unknown> {
    const ps: Record<number, unknown> = {};
    for (const [id, s] of this.side) ps[id] = { s, p: this.pulls.get(id) };
    return { t: this.t, rope: Math.round(this.rope * 1000) / 1000, w: this.winner, ps, n: this.size };
  }

  results(): MgResult[] {
    const w = this.winner >= 0 ? this.winner : this.rope < 0 ? 0 : 1;
    const sorted = [...this.players].sort((a, b) => {
      const wa = this.side.get(a.id) === w ? 1 : 0;
      const wb = this.side.get(b.id) === w ? 1 : 0;
      return wb - wa || this.pulls.get(b.id)! - this.pulls.get(a.id)!;
    });
    // Todo el equipo ganador es primero.
    return sorted.map((p, i) => {
      const won = this.side.get(p.id) === w;
      return { id: p.id, score: this.pulls.get(p.id)!, place: won ? 0 : Math.min(3, i), won, label: `${won ? 'GANA' : 'PIERDE'} · ${this.pulls.get(p.id)} TIRONES`, bonus: 0 };
    });
  }

  bot(id: number, _dt: number): MgKey[] {
    // Los bots siguen el ritmo con algo de error.
    const off = this.botPhase.get(id)!;
    const ph = (this.t + off) / A.beat;
    const near = Math.abs(ph - Math.round(ph)) * A.beat < 0.02;
    if (near && this.lastBeat.get(id) !== Math.round(this.t / A.beat) && this.rng() < 0.85) {
      this.botPhase.set(id, (this.rng() - 0.5) * 0.18);
      return ['a'];
    }
    return [];
  }
}

export const TIRA: MgDef = {
  id: 'tira',
  name: 'TIRA Y AFLOJA',
  howto: ['AZULES CONTRA ROJOS', 'PULSA ESPACIO AL RITMO DEL PULSO'],
  keys: 'ESPACIO (AL RITMO)',
  color: 0x7cc8ff,
  create: (players, rng) => new Tira(players, rng),
};
