/**
 * PARÓN DOPAMINA y EVENTOS. La partida se congela para todos y:
 *  - "mini":    ¡PARÓN! → tragaperras → recordatorio de 2 s → minijuego → podio (ventaja) → 3-2-1.
 *               A veces "Parón Doble": dos minijuegos seguidos rápidos.
 *  - "ruleta":  Evento Ruleta: apuesta (10 s) → gira → resultado (3 s) → 3-2-1. Sin pulsar nada más.
 *  - "carrera": Evento Carrera de caballos: elige caballo → carrera → 3-2-1.
 * Igual online (servidor) y offline.
 */
import { MG, PARON } from '../balance';
import { ATRAPA } from './atrapa';
import { CABALLOS } from './caballos';
import { CORTA } from './corta';
import { CUENTA } from './cuenta';
import { REFLEJOS } from './reflejos';
import { RITMO } from './ritmo';
import { RULETA, RuletaEvento } from './ruleta';
import { TIRA } from './tira';
import { TORRE } from './torre';
import { TRILERO } from './trilero';
import type { MgDef, MgExtra, MgId, MgKey, MgPlayer, MgResult, MiniGame } from './types';

export * from './types';

/** Minijuegos del Parón (la ruleta y la carrera son eventos aparte). */
export const MINIGAMES: MgDef[] = [CORTA, TORRE, TIRA, TRILERO, REFLEJOS, RITMO, ATRAPA, CUENTA];
export const EVENTS: MgDef[] = [RULETA, CABALLOS];

export function mgDef(id: MgId): MgDef {
  return [...MINIGAMES, ...EVENTS].find((m) => m.id === id) ?? CORTA;
}

export type ParonKind = 'mini' | 'ruleta' | 'carrera';

export type Perk = 'speed' | 'shield' | 'cooldown';
export const PERKS: { id: Perk; name: string; desc: string }[] = [
  { id: 'speed', name: '+10% VELOCIDAD', desc: 'HASTA EL FINAL' },
  { id: 'shield', name: 'ESCUDO', desc: 'PARA UN GOLPE' },
  { id: 'cooldown', name: 'RECARGA RÁPIDA', desc: 'HABILIDADES -20%' },
];

/**
 * Bolsa barajada: no se repite un minijuego en la misma partida y, entre partidas,
 * recuerda los últimos para que salgan todos.
 */
export class MgBag {
  bag: MgId[] = [];
  recent: MgId[] = [];
  constructor(private rng: () => number, saved?: { bag?: MgId[]; recent?: MgId[] }) {
    const ok = (ids: unknown) => (Array.isArray(ids) ? ids.filter((i): i is MgId => MINIGAMES.some((m) => m.id === i)) : []);
    this.bag = ok(saved?.bag);
    this.recent = ok(saved?.recent);
  }

  private refill(): void {
    const all = MINIGAMES.map((m) => m.id);
    for (let i = all.length - 1; i > 0; i--) {
      const j = Math.floor(this.rng() * (i + 1));
      [all[i], all[j]] = [all[j], all[i]];
    }
    // Los últimos jugados, al fondo de la bolsa nueva.
    all.sort((a, b) => Number(this.recent.includes(a)) - Number(this.recent.includes(b)));
    this.bag = all;
  }

  /** Saca n minijuegos que no se hayan jugado en esta partida. */
  draw(n: number, usedThisMatch: Set<MgId>): MgId[] {
    const out: MgId[] = [];
    for (let guard = 0; out.length < n && guard < 40; guard++) {
      if (!this.bag.length) this.refill();
      const i = this.bag.findIndex((id) => !usedThisMatch.has(id) && !out.includes(id));
      if (i < 0) {
        this.refill();
        continue;
      }
      out.push(this.bag.splice(i, 1)[0]);
    }
    for (const id of out) {
      usedThisMatch.add(id);
      this.recent = [id, ...this.recent.filter((r) => r !== id)].slice(0, PARON.bagMemory);
    }
    return out;
  }
}

export type ParonPhase = 'break' | 'slot' | 'howto' | 'play' | 'podium' | 'count' | 'end';

export interface ParonNet {
  k: ParonKind;
  ph: ParonPhase;
  /** Segundos que le quedan a la fase. */
  pt: number;
  mg: MgId;
  /** Minijuego n de m (Parón Doble). */
  i: number;
  n: number;
  /** Partida o "Sala de minijuegos" (sin cuenta atrás de vuelta). */
  solo: boolean;
  st?: Record<string, unknown>;
  res?: MgResult[];
  /** Ventajas: id → [seleccionada, elegida] */
  perk?: Record<number, [number, boolean]>;
}

export interface ParonOpts {
  kind?: ParonKind;
  /** Minijuegos de este Parón (1, o 2 si es doble). Si falta, uno al azar. */
  queue?: MgId[];
  solo?: boolean;
  extra: MgExtra;
  /** Ruleta: ¿el número lo saca este mismo objeto? (servidor sí; offline lo pide al servidor). */
  rouletteAuto?: boolean;
  balance?: (id: number) => number;
}

export class Paron {
  phase: ParonPhase = 'break';
  pt: number;
  game!: MiniGame;
  def!: MgDef;
  readonly kind: ParonKind;
  readonly queue: MgId[];
  index = 0;
  /** Resultados de cada minijuego jugado en este Parón. */
  rounds: { mg: MgId; results: MgResult[] }[] = [];
  results: MgResult[] = [];
  perks = new Map<number, { sel: number; chosen: boolean; botAt: number }>();

  constructor(
    readonly players: MgPlayer[],
    private rng: () => number,
    private opts: ParonOpts,
  ) {
    this.kind = opts.kind ?? 'mini';
    this.queue = this.kind === 'ruleta' ? ['ruleta'] : this.kind === 'carrera' ? ['caballos'] : opts.queue?.length ? opts.queue : [MINIGAMES[Math.floor(rng() * MINIGAMES.length)].id];
    this.load(0);
    this.pt = PARON.phases.break;
    // En la Sala de minijuegos no hay "¡PARÓN!": directos al recordatorio.
    if (opts.solo) {
      this.phase = 'howto';
      this.pt = PARON.phases.howto;
    }
  }

  private load(i: number): void {
    this.index = i;
    const id = this.queue[i];
    if (id === 'ruleta') {
      this.def = RULETA;
      this.game = new RuletaEvento(this.players, this.rng, this.opts.extra, { auto: this.opts.rouletteAuto !== false, balance: this.opts.balance ?? (() => 200) });
    } else {
      this.def = mgDef(id);
      this.game = this.def.create(this.players, this.rng, this.opts.extra);
    }
  }

  get done(): boolean {
    return this.phase === 'end';
  }

  get ruleta(): RuletaEvento | null {
    return this.game instanceof RuletaEvento ? this.game : null;
  }

  /** Una tecla. `lag` = segundos de compensación por el ping (online). */
  input(id: number, k: MgKey, lag = 0): void {
    if (this.phase === 'play') this.game.input(id, k, Math.max(0, this.game.t - lag));
    else if (this.phase === 'podium') {
      const p = this.perks.get(id);
      if (!p || p.chosen) return;
      if (k === 'l') p.sel = (p.sel + PERKS.length - 1) % PERKS.length;
      else if (k === 'r') p.sel = (p.sel + 1) % PERKS.length;
      else p.chosen = true;
    }
  }

  private go(ph: ParonPhase, t: number): void {
    this.phase = ph;
    this.pt = t;
  }

  private next(): void {
    const P = PARON.phases;
    const last = this.index >= this.queue.length - 1;
    switch (this.phase) {
      case 'break':
        if (this.kind === 'ruleta') this.go('play', this.game.duration);
        else if (this.kind === 'carrera') this.go('howto', P.howto);
        else this.go('slot', P.slot);
        break;
      case 'slot':
        this.go('howto', P.howto);
        break;
      case 'howto':
        this.go('play', this.game.duration);
        break;
      case 'play': {
        const res = this.game.results();
        this.rounds.push({ mg: this.queue[this.index], results: res });
        this.results = res;
        if (this.kind !== 'mini') {
          this.go(this.opts.solo ? 'end' : 'count', this.opts.solo ? 0 : P.count);
          break;
        }
        if (last) for (const r of res) if (r.won) this.perks.set(r.id, { sel: Math.floor(this.rng() * PERKS.length), chosen: false, botAt: 1 + this.rng() * 1.5 });
        this.go('podium', last ? P.podium : P.podiumQuick);
        break;
      }
      case 'podium':
        if (!last) {
          // Parón Doble: el siguiente minijuego, sin más esperas.
          this.load(this.index + 1);
          this.perks.clear();
          this.go('howto', P.howto);
          break;
        }
        for (const p of this.perks.values()) p.chosen = true;
        this.go(this.opts.solo ? 'end' : 'count', this.opts.solo ? 0 : P.count);
        break;
      case 'count':
        this.go('end', 0);
        break;
    }
  }

  tick(dt: number): void {
    if (this.phase === 'end') return;
    this.pt -= dt;
    if (this.phase === 'play') {
      for (const p of this.players) if (p.bot) for (const k of this.game.bot(p.id, dt)) this.game.input(p.id, k, this.game.t);
      this.game.tick(dt);
      // La ruleta puede alargarse un poco si el número tarda en llegar.
      this.pt = this.game.duration - this.game.t;
      if (this.game.done) this.pt = 0;
    }
    if (this.phase === 'podium') {
      for (const pl of this.players) {
        const p = this.perks.get(pl.id);
        if (!p || !pl.bot || p.chosen) continue;
        p.botAt -= dt;
        if (p.botAt <= 0) p.chosen = true;
      }
    }
    if (this.pt <= 0) this.next();
  }

  /** Ventaja elegida por cada ganador. */
  chosenPerks(): Map<number, Perk> {
    const m = new Map<number, Perk>();
    for (const [id, p] of this.perks) m.set(id, PERKS[p.sel].id);
    return m;
  }

  net(): ParonNet {
    const out: ParonNet = { k: this.kind, ph: this.phase, pt: Math.round(this.pt * 100) / 100, mg: this.queue[this.index], i: this.index, n: this.queue.length, solo: !!this.opts.solo };
    if (this.phase === 'play' || this.phase === 'howto' || (this.kind !== 'mini' && this.phase === 'count')) out.st = this.game.state();
    if (this.phase === 'podium' || this.phase === 'count' || this.phase === 'end') {
      out.res = this.results;
      const perk: Record<number, [number, boolean]> = {};
      for (const [id, p] of this.perks) perk[id] = [p.sel, p.chosen];
      out.perk = perk;
    }
    return out;
  }
}

export { MG };
export type { MgDef, MgExtra, MgId, MgKey, MgPlayer, MgResult, MiniGame };
