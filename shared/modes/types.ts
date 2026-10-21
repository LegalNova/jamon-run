import type { SimChar } from '../sim/Char';
import type { Sim } from '../sim/Sim';
import type { ModeId, PickupType, Team } from '../sim/types';

/** Estado del modo que viaja en cada snapshot (y que lee el HUD). */
export interface ModeNet {
  /** Fase. Escondite: 0 = esconderse, 1 = buscar. Bomba: 0 = mecha, 1 = entre rondas. */
  ph: number;
  /** Segundos que quedan de la fase (décimas). */
  pt: number;
  /** Ronda (Jamón Bomba). */
  r: number;
  /** Jamones bomba: [portador, urgencia 0..2, ...]. */
  b: number[];
  /** Infección: posición del último superviviente [x, y] (vacío si no toca). */
  pg: number[];
  /** Presas vivas y total (para la música y el HUD). */
  n: number;
  tot: number;
  /** Efecto global de la ruleta activo y segundos que le quedan. */
  fx: string;
  ft: number;
  /** Escondite: segundos hasta la siguiente pista. */
  nh: number;
  /** La casa: luces encendidas por habitación (bits). */
  lt?: number[];
}

export const emptyModeNet = (): ModeNet => ({ ph: 1, pt: 0, r: 0, b: [], pg: [], n: 0, tot: 0, fx: '', ft: 0, nh: 0 });

/**
 * Interfaz común de los modos de juego. Cada modo es un módulo en /shared/modes
 * y la simulación le delega: preparación, reglas, tick, condición de victoria y datos del HUD.
 */
export interface GameMode {
  readonly id: ModeId;
  /** Ajustes al empezar (equipos, vida, objetos del mapa...). */
  setup(sim: Sim): void;
  /** Reglas que se ejecutan cada paso de la partida. */
  tick(sim: Sim, dt: number): void;
  /** Mira si alguien ha ganado (llama a sim.end). */
  checkEnd(sim: Sim): void;
  /** ¿Es cazador? (lo usa la IA para perseguir o huir). */
  isHunter(c: SimChar): boolean;
  /** ¿Puede `a` dañar a `v` con el jamón? */
  canHit(a: SimChar, v: SimChar): boolean;
  /** A alguien se le acabó la vida. */
  onDowned(sim: Sim, v: SimChar, a: SimChar | null): void;
  /** Objetos que aparecen y su peso (null = ninguno). */
  readonly itemWeights: Partial<Record<PickupType, number>> | null;
  canPickup(c: SimChar, type: PickupType): boolean;
  onPickup(sim: Sim, c: SimChar, type: PickupType): void;
  useItem(sim: Sim, c: SimChar): void;
  disguise(sim: Sim, c: SimChar): void;
  rotate(sim: Sim, c: SimChar): void;
  meleeDamage(): number;
  /** Tras un golpe (victims = a quién ha dado). */
  afterMelee(sim: Sim, a: SimChar, victims: SimChar[]): void;
  /** Datos para el HUD de todos. */
  net(sim: Sim, out: ModeNet): void;
  /** Medallas propias del modo al acabar. */
  finish(sim: Sim, winner: Team): void;
}

/** Comportamiento por defecto (cada modo sobreescribe lo que necesita). */
export abstract class BaseMode implements GameMode {
  abstract readonly id: ModeId;
  readonly itemWeights: Partial<Record<PickupType, number>> | null = null;
  setup(_sim: Sim): void {}
  tick(_sim: Sim, _dt: number): void {}
  abstract checkEnd(sim: Sim): void;
  isHunter(c: SimChar): boolean {
    return c.team === 'chaser';
  }
  canHit(a: SimChar, v: SimChar): boolean {
    return a.team === 'chaser' && v.team !== 'chaser' && v.free;
  }
  onDowned(sim: Sim, v: SimChar, a: SimChar | null): void {
    v.knockOut(sim, a ? a.id : -1);
  }
  canPickup(_c: SimChar, _type: PickupType): boolean {
    return false;
  }
  onPickup(_sim: Sim, _c: SimChar, _type: PickupType): void {}
  useItem(_sim: Sim, _c: SimChar): void {}
  disguise(_sim: Sim, _c: SimChar): void {}
  rotate(_sim: Sim, _c: SimChar): void {}
  meleeDamage(): number {
    return 0;
  }
  afterMelee(_sim: Sim, _a: SimChar, _victims: SimChar[]): void {}
  net(_sim: Sim, _out: ModeNet): void {}
  finish(_sim: Sim, _winner: Team): void {}
}
