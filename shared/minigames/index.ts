/**
 * PARÓN DOPAMINA: ¡PARÓN! → tragaperras que elige minijuego → explicación de 2 s → minijuego
 * → podio (el ganador elige una ventaja) → cuenta atrás 3-2-1. Igual online (servidor) y offline.
 */
import { PARON } from '../balance';
import { CABALLOS } from './caballos';
import { CORTA } from './corta';
import { REFLEJOS } from './reflejos';
import { RITMO } from './ritmo';
import { RULETA } from './ruleta';
import { TIRA } from './tira';
import { TORRE } from './torre';
import { TRILERO } from './trilero';
import type { MgDef, MgExtra, MgId, MgKey, MgPlayer, MgResult, MiniGame } from './types';

export * from './types';

export const MINIGAMES: MgDef[] = [RULETA, CABALLOS, CORTA, TORRE, TIRA, TRILERO, REFLEJOS, RITMO];

export function mgDef(id: MgId): MgDef {
  return MINIGAMES.find((m) => m.id === id) ?? RULETA;
}

export type Perk = 'speed' | 'shield' | 'cooldown';
export const PERKS: { id: Perk; name: string; desc: string }[] = [
  { id: 'speed', name: '+10% VELOCIDAD', desc: 'LO QUE QUEDA DE PARTIDA' },
  { id: 'shield', name: 'ESCUDO', desc: 'PARA UN GOLPE' },
  { id: 'cooldown', name: 'RECARGA RÁPIDA', desc: 'HABILIDADES -20%' },
];

export type ParonPhase = 'break' | 'slot' | 'howto' | 'play' | 'podium' | 'count' | 'end';

export interface ParonNet {
  ph: ParonPhase;
  /** Segundos que le quedan a la fase. */
  pt: number;
  mg: MgId;
  /** Partida o "Sala de minijuegos" (sin cuenta atrás de vuelta). */
  solo: boolean;
  st?: Record<string, unknown>;
  res?: MgResult[];
  /** Ventajas: id → [seleccionada, elegida] */
  perk?: Record<number, [number, boolean]>;
}

export class Paron {
  phase: ParonPhase = 'break';
  pt: number;
  game: MiniGame;
  readonly def: MgDef;
  results: MgResult[] = [];
  perks = new Map<number, { sel: number; chosen: boolean; botAt: number }>();

  constructor(
    readonly players: MgPlayer[],
    private rng: () => number,
    private opts: { solo?: boolean; forced?: MgId; extra: MgExtra; skipBreak?: boolean },
  ) {
    this.def = opts.forced ? mgDef(opts.forced) : MINIGAMES[Math.floor(rng() * MINIGAMES.length)];
    this.game = this.def.create(players, rng, opts.extra);
    if (opts.skipBreak) {
      this.phase = 'howto';
      this.pt = PARON.phases.howto;
    } else this.pt = PARON.phases.break;
  }

  get done(): boolean {
    return this.phase === 'end';
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

  private next(): void {
    const P = PARON.phases;
    switch (this.phase) {
      case 'break':
        this.phase = 'slot';
        this.pt = P.slot;
        break;
      case 'slot':
        this.phase = 'howto';
        this.pt = P.howto;
        break;
      case 'howto':
        this.phase = 'play';
        this.pt = this.game.duration;
        break;
      case 'play':
        this.results = this.game.results();
        for (const r of this.results) if (r.won) this.perks.set(r.id, { sel: Math.floor(this.rng() * PERKS.length), chosen: false, botAt: 1 + this.rng() * 1.5 });
        this.phase = 'podium';
        this.pt = P.podium;
        break;
      case 'podium':
        for (const p of this.perks.values()) p.chosen = true;
        if (this.opts.solo) {
          this.phase = 'end';
          this.pt = 0;
        } else {
          this.phase = 'count';
          this.pt = P.count;
        }
        break;
      case 'count':
        this.phase = 'end';
        this.pt = 0;
        break;
    }
  }

  tick(dt: number): void {
    if (this.phase === 'end') return;
    this.pt -= dt;
    if (this.phase === 'play') {
      for (const p of this.players) if (p.bot) for (const k of this.game.bot(p.id, dt)) this.game.input(p.id, k, this.game.t);
      this.game.tick(dt);
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
    const out: ParonNet = { ph: this.phase, pt: Math.round(this.pt * 100) / 100, mg: this.def.id, solo: !!this.opts.solo };
    if (this.phase === 'play' || this.phase === 'howto') out.st = this.game.state();
    if (this.phase === 'podium' || this.phase === 'count' || this.phase === 'end') {
      out.res = this.results;
      const perk: Record<number, [number, boolean]> = {};
      for (const [id, p] of this.perks) perk[id] = [p.sel, p.chosen];
      out.perk = perk;
    }
    return out;
  }
}

export type { MgDef, MgExtra, MgId, MgKey, MgPlayer, MgResult, MiniGame };
