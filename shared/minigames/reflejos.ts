/** REFLEJOS IBÉRICOS: cuando sale el jamón, ¡pulsa! Si pulsas antes, esa ronda quedas fuera. */
import { MG } from '../balance';
import { MgDef, MgKey, MgPlayer, MiniGame, rank } from './types';

const F = MG.reflejos;

class Reflejos implements MiniGame {
  readonly id = 'reflejos' as const;
  readonly duration: number;
  t = 0;
  done = false;
  private rounds: { start: number; sig: number; end: number }[] = [];
  private cur = 0;
  /** ms de cada ronda (-1 = pulsó antes, -2 = no pulsó) */
  private ps = new Map<number, { ms: (number | null)[] }>();
  private botReact = new Map<number, number>();

  constructor(private players: MgPlayer[], private rng: () => number) {
    let t = 0.4;
    for (let i = 0; i < F.rounds; i++) {
      const sig = t + F.waitMin + rng() * (F.waitMax - F.waitMin);
      const end = sig + F.window;
      this.rounds.push({ start: t, sig, end });
      t = end + F.gap;
    }
    this.duration = t;
    for (const p of players) {
      this.ps.set(p.id, { ms: new Array(F.rounds).fill(null) });
      this.botReact.set(p.id, 0.22 + rng() * 0.2);
    }
  }

  input(id: number, k: MgKey, t: number): void {
    if (k !== 'a' && k !== 'b') return;
    const p = this.ps.get(id);
    const r = this.rounds[this.cur];
    if (!p || !r || p.ms[this.cur] !== null || t < r.start) return;
    if (t < r.sig) p.ms[this.cur] = -1;
    else if (t <= r.end) p.ms[this.cur] = Math.max(80, Math.round((t - r.sig) * 1000));
  }

  tick(dt: number): void {
    this.t += dt;
    const r = this.rounds[this.cur];
    if (r && this.t >= r.end + F.gap * 0.5) {
      for (const p of this.ps.values()) if (p.ms[this.cur] === null) p.ms[this.cur] = -2;
      this.cur++;
    }
    if (this.cur >= this.rounds.length) this.done = true;
  }

  private total(id: number): number {
    return this.ps.get(id)!.ms.reduce<number>((a, m) => a + (m === null ? 0 : m === -1 ? F.early : m === -2 ? F.window * 1000 : m), 0);
  }

  private best(id: number): number {
    const v = this.ps.get(id)!.ms.filter((m): m is number => m !== null && m > 0);
    return v.length ? Math.min(...v) : 0;
  }

  state(): Record<string, unknown> {
    const r = this.rounds[Math.min(this.cur, this.rounds.length - 1)];
    const ps: Record<number, unknown> = {};
    for (const [id, p] of this.ps) ps[id] = { ms: p.ms };
    // La señal solo se envía cuando ya ha salido (nadie puede saber antes cuándo será).
    return { t: this.t, r: this.cur, sig: this.t >= r.sig && this.t <= r.end, sigAt: this.t >= r.sig ? r.sig : -1, rs: r.start, ps };
  }

  results() {
    return rank(this.players, (id) => this.total(id), (id) => (this.best(id) ? `MEJOR ${this.best(id)} MS` : 'SIN TIEMPO'), false);
  }

  bot(id: number, _dt: number): MgKey[] {
    const r = this.rounds[this.cur];
    const p = this.ps.get(id)!;
    if (!r || p.ms[this.cur] !== null) return [];
    if (this.t >= r.sig + this.botReact.get(id)!) {
      this.botReact.set(id, 0.22 + this.rng() * 0.22);
      return ['a'];
    }
    // Algún bot nervioso se adelanta.
    if (this.t > r.start + 1 && this.t < r.sig && this.rng() < 0.0015) return ['a'];
    return [];
  }
}

export const REFLEJOS: MgDef = {
  id: 'reflejos',
  name: 'REFLEJOS IBÉRICOS',
  howto: ['ESPERA... CUANDO SALGA EL JAMÓN', '¡ESPACIO! SI TE ADELANTAS, FUERA'],
  keys: 'ESPACIO',
  color: 0xe43b44,
  create: (players, rng) => new Reflejos(players, rng),
};
