import type { AIParams } from '../balance';
import type { Grid } from '../grid';
import type { Look } from '../look';

export type Team = 'chaser' | 'escapist';
export type PickupType = 'medkit' | 'boot' | 'shield' | 'gold';
export type MatchState = 'countdown' | 'play' | 'ended';

/** Lo que un controlador (jugador o bot) pide hacer en este paso. */
export interface Intent {
  mx: number;
  my: number;
  sprint: boolean;
  action: boolean;
  special: boolean;
  /** Dirección de apuntado (0,0 = hacia donde mira). */
  aimX: number;
  aimY: number;
}

export const emptyIntent = (): Intent => ({ mx: 0, my: 0, sprint: false, action: false, special: false, aimX: 0, aimY: 0 });

/** Estado "mantenido" que envía un jugador humano (teclas pulsadas). */
export interface HeldInput {
  mx: number;
  my: number;
  sprint: boolean;
}

export interface Stats {
  hits: number;
  hitsTaken: number;
  damage: number;
  eliminations: number;
  items: number;
  timeSurvived: number;
  dodges: number;
  blocks: number;
  throwsHit: number;
  rescues: number;
}

export const emptyStats = (): Stats => ({
  hits: 0,
  hitsTaken: 0,
  damage: 0,
  eliminations: 0,
  items: 0,
  timeSurvived: 0,
  dodges: 0,
  blocks: 0,
  throwsHit: 0,
  rescues: 0,
});

/** Eventos de la simulación: la vista los convierte en efectos y sonidos (y viajan por la red). */
export type SimEvent =
  | { t: 'countdown'; n: number }
  | { t: 'release' }
  | { t: 'end'; winner: Team }
  | { t: 'swing'; id: number }
  | { t: 'hit'; v: number; a: number; dmg: number; nx: number; ny: number }
  | { t: 'dodge'; v: number }
  | { t: 'block'; v: number; nx: number; ny: number }
  | { t: 'ko'; v: number; a: number }
  | { t: 'dash'; id: number }
  | { t: 'throw'; id: number; pid: number }
  | { t: 'projEnd'; pid: number; x: number; y: number; thud: boolean }
  | { t: 'smoke'; sid: number; x: number; y: number }
  | { t: 'itemSpawn'; iid: number; type: PickupType; x: number; y: number }
  | { t: 'pickup'; iid: number; id: number; type: PickupType; x: number; y: number }
  | { t: 'say'; id: number; p: number }
  /** Pillado: queda atrapado esperando rescate. */
  | { t: 'trap'; v: number; a: number }
  | { t: 'rescue'; v: number; by: number }
  | { t: 'streak'; id: number; n: number }
  | { t: 'metro'; id: number; x0: number; y0: number; x1: number; y1: number }
  | { t: 'wind'; on: boolean; dx: number };

/** Quién juega una partida. */
export interface RosterEntry {
  id: number;
  name: string;
  team: Team;
  look: Look;
  /** true = lo controla una persona (local u online). */
  human: boolean;
}

/** Lo que una entidad necesita del mundo para actualizarse (Sim o predicción del cliente). */
export interface SimCtx {
  grid: Grid;
  ai: AIParams;
  matchTime: number;
  canMove(c: { team: Team }): boolean;
  inSmoke(x: number, y: number): boolean;
  /** Viento (Ceuta): empuje en px/s. */
  wind: { x: number; y: number };
  emit(e: SimEvent): void;
  /** Golpe cuerpo a cuerpo resuelto por el mundo (no-op en la predicción). */
  meleeHit(attackerId: number): void;
  throwHam(attackerId: number, x: number, y: number, dx: number, dy: number): void;
  dropSmoke(x: number, y: number): void;
}
