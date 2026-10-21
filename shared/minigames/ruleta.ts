/** RULETA AMERICANA: 38 casillas (0 y 00 verdes). Se apuesta con fichas; gana quien acabe con más. */
import { MG } from '../balance';
import { MgDef, MgKey, MgPlayer, MiniGame, MgExtra, rank } from './types';

const R = MG.ruleta;
/** Orden real de la rueda americana. */
export const WHEEL = ['0', '28', '9', '26', '30', '11', '7', '20', '32', '17', '5', '22', '34', '15', '3', '24', '36', '13', '1', '00', '27', '10', '25', '29', '12', '8', '19', '31', '18', '6', '21', '33', '16', '4', '23', '35', '14', '2'];
export const RED = new Set([1, 3, 5, 7, 9, 12, 14, 16, 18, 19, 21, 23, 25, 27, 30, 32, 34, 36]);
export const BETS = ['rojo', 'negro', 'verde', 'par', 'impar', 'bajo', 'alto', 'numero'] as const;
export type BetId = (typeof BETS)[number];
export const BET_NAMES: Record<BetId, string> = { rojo: 'ROJO', negro: 'NEGRO', verde: 'VERDE 0/00', par: 'PAR', impar: 'IMPAR', bajo: '1-18', alto: '19-36', numero: 'TU NÚMERO' };

export function pocketColor(p: string): 'verde' | 'rojo' | 'negro' {
  if (p === '0' || p === '00') return 'verde';
  return RED.has(Number(p)) ? 'rojo' : 'negro';
}

export function betWins(b: BetId, pocket: string, lucky: number): boolean {
  const green = pocket === '0' || pocket === '00';
  const n = Number(pocket);
  switch (b) {
    case 'rojo':
      return !green && RED.has(n);
    case 'negro':
      return !green && !RED.has(n);
    case 'verde':
      return green;
    case 'par':
      return !green && n % 2 === 0;
    case 'impar':
      return !green && n % 2 === 1;
    case 'bajo':
      return !green && n <= 18;
    case 'alto':
      return !green && n >= 19;
    case 'numero':
      return !green && n === lucky;
  }
}

interface P {
  chips: number;
  bets: Record<string, number>;
  sel: number;
  lucky: number;
  last: BetId[];
  won: number;
}

class Ruleta implements MiniGame {
  readonly id = 'ruleta' as const;
  readonly duration = R.bet + R.spin + R.show;
  t = 0;
  done = false;
  private ps = new Map<number, P>();
  private pocket = '';
  private resolved = false;
  private botNext = new Map<number, number>();

  constructor(private players: MgPlayer[], private rng: () => number, private extra: MgExtra) {
    for (const p of players) {
      this.ps.set(p.id, { chips: R.chips, bets: {}, sel: 0, lucky: 1 + Math.floor(rng() * 36), last: [], won: 0 });
      this.botNext.set(p.id, 1 + rng() * 3);
    }
  }

  input(id: number, k: MgKey, t: number): void {
    const p = this.ps.get(id);
    if (!p || t >= R.bet) return;
    if (k === 'l') p.sel = (p.sel + BETS.length - 1) % BETS.length;
    else if (k === 'r') p.sel = (p.sel + 1) % BETS.length;
    else if (k === 'a') {
      if (p.chips < R.chip) return;
      const b = BETS[p.sel];
      p.chips -= R.chip;
      p.bets[b] = (p.bets[b] ?? 0) + R.chip;
      p.last.push(b);
    } else if (k === 'b') {
      const b = p.last.pop();
      if (!b) return;
      p.bets[b] -= R.chip;
      if (p.bets[b] <= 0) delete p.bets[b];
      p.chips += R.chip;
    }
  }

  tick(dt: number): void {
    this.t += dt;
    // "No va más": el número sale del azar del servidor cuando se cierran las apuestas.
    if (!this.pocket && this.t >= R.bet) this.pocket = WHEEL[Math.floor(this.rng() * WHEEL.length)];
    if (!this.resolved && this.t >= R.bet + R.spin) {
      this.resolved = true;
      for (const p of this.ps.values()) {
        for (const [b, amount] of Object.entries(p.bets)) {
          if (betWins(b as BetId, this.pocket, p.lucky)) {
            const win = amount * (R.pay[b as BetId] + 1);
            p.chips += win;
            p.won += win;
          }
        }
      }
      this.extra.rouletteHistory.unshift(this.pocket);
      this.extra.rouletteHistory.length = Math.min(10, this.extra.rouletteHistory.length);
    }
    if (this.t >= this.duration) this.done = true;
  }

  state(): Record<string, unknown> {
    const ps: Record<number, unknown> = {};
    for (const [id, p] of this.ps) ps[id] = { c: p.chips, b: p.bets, s: p.sel, n: p.lucky, w: this.resolved ? p.won : 0 };
    return { t: this.t, ps, pk: this.t >= R.bet ? this.pocket : '', h: this.extra.rouletteHistory.slice(0, 10), res: this.resolved };
  }

  results() {
    const bonus = (id: number) => Math.min(R.bonusCap, Math.floor(Math.max(0, this.ps.get(id)!.chips - R.chips) * R.bonusRate));
    return rank(this.players, (id) => this.ps.get(id)!.chips, (id) => `${this.ps.get(id)!.chips} FICHAS`, true, bonus);
  }

  bot(id: number, dt: number): MgKey[] {
    if (this.t >= R.bet - 0.5) return [];
    const n = (this.botNext.get(id) ?? 0) - dt;
    this.botNext.set(id, n);
    if (n > 0) return [];
    this.botNext.set(id, 0.5 + this.rng() * 1.5);
    const p = this.ps.get(id)!;
    if (Object.keys(p.bets).length >= 3 || p.chips < R.chip) return [];
    const want = this.rng() < 0.6 ? Math.floor(this.rng() * 2) : Math.floor(this.rng() * BETS.length);
    return p.sel === want ? ['a', 'a'] : [p.sel < want ? 'r' : 'l'];
  }
}

export const RULETA: MgDef = {
  id: 'ruleta',
  name: 'RULETA AMERICANA',
  howto: ['← → ELIGE ROJO, NEGRO, VERDE...', 'ESPACIO APUESTA · E QUITA FICHA'],
  keys: '← → · ESPACIO · E',
  color: 0x63c74d,
  create: (players, rng, extra) => new Ruleta(players, rng, extra),
};
