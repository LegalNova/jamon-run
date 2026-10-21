/**
 * EVENTO RULETA (no es un minijuego): rojo, negro o verde (0 y 00).
 * Una apuesta por persona, en lonchas. El número lo decide el servidor.
 */
import { MG } from '../balance';
import { MgDef, MgKey, MgPlayer, MgResult, MiniGame, MgExtra } from './types';

const R = MG.ruleta;
/** Orden real de la rueda americana. */
export const WHEEL = ['0', '28', '9', '26', '30', '11', '7', '20', '32', '17', '5', '22', '34', '15', '3', '24', '36', '13', '1', '00', '27', '10', '25', '29', '12', '8', '19', '31', '18', '6', '21', '33', '16', '4', '23', '35', '14', '2'];
export const RED = new Set([1, 3, 5, 7, 9, 12, 14, 16, 18, 19, 21, 23, 25, 27, 30, 32, 34, 36]);
export const COLORS = ['rojo', 'negro', 'verde'] as const;
export type Color = (typeof COLORS)[number];

export function pocketColor(p: string): Color {
  if (p === '0' || p === '00') return 'verde';
  return RED.has(Number(p)) ? 'rojo' : 'negro';
}

/** Lo que te llevas (positivo) o pierdes (negativo). */
export function payout(c: Color | null, amount: number, pocket: string): number {
  if (!c || amount <= 0) return 0;
  return pocketColor(pocket) === c ? amount * R.pay[c] : -amount;
}

export class RuletaEvento implements MiniGame {
  readonly id = 'ruleta' as const;
  t = 0;
  done = false;
  pocket = '';
  spinStart = -1;
  private bets = new Map<number, { c: Color | null; a: number }>();
  private botAt = new Map<number, number>();

  constructor(private players: MgPlayer[], private rng: () => number, private extra: MgExtra, private opts: { auto: boolean; balance: (id: number) => number }) {
    for (const p of players) {
      this.bets.set(p.id, { c: null, a: 0 });
      this.botAt.set(p.id, 1.5 + rng() * 6);
    }
  }

  get duration(): number {
    return this.spinStart < 0 ? R.bet + R.spin + R.show : this.spinStart + R.spin + R.show;
  }

  /** Tu apuesta: color y cantidad (se puede cambiar mientras dura la barra). */
  bet(id: number, c: unknown, a: unknown): void {
    const b = this.bets.get(id);
    if (!b || this.t >= R.bet) return;
    const color = COLORS.includes(c as Color) ? (c as Color) : null;
    const max = Math.max(0, Math.min(R.maxBet, Math.floor(this.opts.balance(id))));
    const amount = Math.max(0, Math.min(max, Math.floor(Number(a) || 0)));
    b.c = amount > 0 ? color : null;
    b.a = b.c ? amount : 0;
  }

  betOf(id: number): { c: Color | null; a: number } {
    return this.bets.get(id) ?? { c: null, a: 0 };
  }

  /** El número (lo pone el servidor o, offline, la respuesta del servidor). */
  setPocket(p: string): void {
    if (this.pocket || !WHEEL.includes(p)) return;
    this.pocket = p;
    this.spinStart = Math.max(R.bet, this.t);
    this.extra.rouletteHistory.unshift(p);
    this.extra.rouletteHistory.length = Math.min(10, this.extra.rouletteHistory.length);
  }

  input(_id: number, _k: MgKey, _t: number): void {}

  tick(dt: number): void {
    this.t += dt;
    if (!this.pocket && this.t >= R.bet && this.opts.auto) this.setPocket(WHEEL[Math.floor(this.rng() * WHEEL.length)]);
    // Si el número no llega (sin conexión), se acaba sin apuestas.
    if (!this.pocket && this.t >= R.bet + 6) {
      for (const b of this.bets.values()) b.c = null;
      this.setPocket(WHEEL[Math.floor(this.rng() * WHEEL.length)]);
    }
    if (this.spinStart >= 0 && this.t >= this.spinStart + R.spin + R.show) this.done = true;
  }

  state(): Record<string, unknown> {
    const ps: Record<number, unknown> = {};
    for (const [id, b] of this.bets) if (b.c) ps[id] = { c: b.c, a: b.a };
    return { t: this.t, ps, pk: this.pocket, ss: this.spinStart, h: this.extra.rouletteHistory.slice(0, 10) };
  }

  results(): MgResult[] {
    return this.players
      .map((p) => {
        const b = this.betOf(p.id);
        const d = this.pocket ? payout(b.c, b.a, this.pocket) : 0;
        return { id: p.id, score: d, place: d > 0 ? 0 : 3, won: d > 0, label: !b.c ? 'SIN APUESTA' : d > 0 ? `+${d} LONCHAS` : `${d} LONCHAS`, bonus: 0 };
      })
      .sort((a, b) => b.score - a.score);
  }

  bot(id: number, dt: number): MgKey[] {
    const left = (this.botAt.get(id) ?? 0) - dt;
    this.botAt.set(id, left);
    if (left > 0 || this.t >= R.bet || this.bets.get(id)!.c) return [];
    this.botAt.set(id, 99);
    const r = this.rng();
    this.bet(id, r < 0.45 ? 'rojo' : r < 0.9 ? 'negro' : 'verde', R.amounts[Math.floor(this.rng() * R.amounts.length)]);
    return [];
  }
}

export const RULETA: MgDef = {
  id: 'ruleta',
  name: 'EVENTO RULETA',
  howto: ['ROJO, NEGRO O VERDE', 'ELIGE CUÁNTO Y A QUÉ COLOR'],
  keys: '1 ROJO · 2 NEGRO · 3 VERDE',
  color: 0x63c74d,
  create: (players, rng, extra) => new RuletaEvento(players, rng, extra, { auto: true, balance: () => 200 }),
};
