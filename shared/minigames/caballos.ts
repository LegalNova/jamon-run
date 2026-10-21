/** CARRERA DE CABALLOS: eliges tu caballo en el Parón; durante la carrera puedes animarlo (ESPACIO). */
import { MG } from '../balance';
import { MgDef, MgKey, MgPlayer, MiniGame, rank } from './types';

const C = MG.caballos;
const N = C.horses.length;

/** Generador determinista para simular la carrera muchas veces y calcular cuotas justas. */
function mulberry(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const SEG = 0.5;

class Caballos implements MiniGame {
  readonly id = 'caballos' as const;
  readonly duration = C.pick + C.race + C.show;
  t = 0;
  done = false;
  private strength: number[] = [];
  private noise: number[][] = [];
  pos = new Array(N).fill(0);
  odds: number[] = [];
  private winner = -1;
  private photo = false;
  private finishT = 0;
  private picks = new Map<number, { sel: number; locked: boolean; cheers: number; cheerT: number }>();
  private botTimer = new Map<number, number>();

  constructor(private players: MgPlayer[], private rng: () => number) {
    for (let i = 0; i < N; i++) this.strength.push(0.95 + rng() * 0.1);
    const segs = Math.ceil((C.race * 1.5) / SEG);
    for (let i = 0; i < N; i++) this.noise.push(Array.from({ length: segs }, () => 0.55 + rng() * 0.9));
    // Cuotas: simulamos la carrera 600 veces con el mismo modelo.
    const sim = mulberry(Math.floor(rng() * 1e9));
    const wins = new Array(N).fill(0);
    for (let k = 0; k < 600; k++) {
      const p = new Array(N).fill(0);
      let w = -1;
      for (let s = 0; w < 0 && s < 100; s++) {
        for (let i = 0; i < N; i++) p[i] += this.base(i) * (0.55 + sim() * 0.9) * SEG;
        let best = -1;
        for (let i = 0; i < N; i++) if (p[i] >= 1 && (best < 0 || p[i] > p[best])) best = i;
        w = best;
      }
      wins[Math.max(0, w)]++;
    }
    this.odds = wins.map((n) => Math.max(2, Math.min(12, Math.round((0.9 * 600) / Math.max(1, n)))));
    for (const pl of players) {
      this.picks.set(pl.id, { sel: Math.floor(rng() * N), locked: false, cheers: 0, cheerT: 0 });
      this.botTimer.set(pl.id, 1 + rng() * 5);
    }
  }

  private base(i: number): number {
    return (this.strength[i] / C.race) * 1.12;
  }

  input(id: number, k: MgKey, t: number): void {
    const p = this.picks.get(id);
    if (!p) return;
    if (t < C.pick) {
      if (p.locked) return;
      if (k === 'l') p.sel = (p.sel + N - 1) % N;
      else if (k === 'r') p.sel = (p.sel + 1) % N;
      else if (k === 'a' || k === 'b') p.locked = true;
      return;
    }
    // Animar a tu caballo: un empujoncito pequeño (con límite por segundo).
    if ((k === 'a' || k === 'b') && p.locked && this.winner < 0 && t < C.pick + C.race) {
      const sec = Math.floor(t);
      if (sec !== p.cheerT) {
        p.cheerT = sec;
        p.cheers = 0;
      }
      if (p.cheers >= C.cheerPerSec) return;
      p.cheers++;
      this.pos[p.sel] += C.cheer;
    }
  }

  tick(dt: number): void {
    this.t += dt;
    if (this.t >= C.pick && this.winner < 0) {
      // Los que no eligieron, se quedan sin caballo.
      const rt = this.t - C.pick;
      const seg = Math.min(this.noise[0].length - 1, Math.floor(rt / SEG));
      for (let i = 0; i < N; i++) this.pos[i] += this.base(i) * this.noise[i][seg] * dt;
      let best = -1;
      for (let i = 0; i < N; i++) if (this.pos[i] >= 1 && (best < 0 || this.pos[i] > this.pos[best])) best = i;
      if (best >= 0 || rt >= C.race) {
        if (best < 0) best = this.pos.indexOf(Math.max(...this.pos));
        this.winner = best;
        this.finishT = this.t;
        const sorted = [...this.pos].sort((a, b) => b - a);
        this.photo = sorted[0] - sorted[1] < 0.025;
      }
    }
    if (this.winner >= 0 && this.t >= this.finishT + C.show) this.done = true;
    if (this.t >= this.duration + 3) this.done = true;
  }

  private score(id: number): number {
    const p = this.picks.get(id)!;
    return this.winner >= 0 && p.locked && p.sel === this.winner ? C.stake * this.odds[this.winner] : 0;
  }

  state(): Record<string, unknown> {
    const ps: Record<number, unknown> = {};
    for (const [id, p] of this.picks) ps[id] = { s: p.sel, l: p.locked };
    return { t: this.t, pos: this.pos.map((x) => Math.round(x * 1000) / 1000), odds: this.odds, w: this.winner, ph: this.photo, ps };
  }

  results() {
    const res = rank(this.players, (id) => this.score(id), (id) => {
      const p = this.picks.get(id)!;
      return !p.locked ? 'SIN CABALLO' : this.score(id) > 0 ? `¡${C.horses[p.sel]}! +${this.score(id)}` : C.horses[p.sel];
    }, true, (id) => Math.min(C.bonusCap, this.score(id)));
    for (const r of res) if (r.score <= 0) r.won = false;
    return res;
  }

  bot(id: number, dt: number): MgKey[] {
    const p = this.picks.get(id)!;
    if (this.t < C.pick) {
      const n = (this.botTimer.get(id) ?? 0) - dt;
      this.botTimer.set(id, n);
      if (n > 0 || p.locked) return [];
      this.botTimer.set(id, 0.4);
      // Los bots prefieren a los favoritos (cuota baja), pero no siempre.
      const fav = this.odds.indexOf(Math.min(...this.odds));
      const want = this.rng() < 0.5 ? fav : Math.floor(this.rng() * N);
      return p.sel === want ? ['a'] : [p.sel < want ? 'r' : 'l'];
    }
    return this.winner < 0 && this.rng() < dt * 5 ? ['a'] : [];
  }
}

export const CABALLOS: MgDef = {
  id: 'caballos',
  name: 'CARRERA DE CABALLOS',
  howto: ['← → ELIGE TU CABALLO GANADOR', 'ESPACIO: ELEGIR Y LUEGO ¡ANIMARLO!'],
  keys: '← → · ESPACIO',
  color: 0xfeae34,
  create: (players, rng) => new Caballos(players, rng),
};
