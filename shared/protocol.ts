/**
 * Protocolo de red (WebSocket, JSON compacto).
 * El servidor es autoritativo: el cliente solo envía entradas y peticiones.
 */
import type { Difficulty } from './balance';
import type { Look } from './look';
import type { BiomeId } from './maps';
import type { MapScale } from './mapScale';
import type { SimChar } from './sim/Char';
import type { MatchState, PickupType, SimEvent, Stats, Team } from './sim/types';

export interface RoomSettings {
  mapId: BiomeId;
  duration: number;
  /** Rellenar con bots hasta este número de personajes (0 = sin bots). */
  botFill: number;
  difficulty: Difficulty;
  /** Aparece en la partida rápida. */
  isPublic: boolean;
}

export interface LobbyPlayer {
  id: number;
  name: string;
  look: Look;
  ready: boolean;
  host: boolean;
  connected: boolean;
}

export type RoomPhase = 'lobby' | 'reveal' | 'playing' | 'results';

export interface RosterNet {
  id: number;
  name: string;
  team: Team;
  look: Look;
  human: boolean;
}

export interface ResultNet {
  id: number;
  name: string;
  team: Team;
  alive: boolean;
  human: boolean;
  look: Look;
  stats: Stats;
}

// ------------------------------------------------------------------ servidor → cliente

export type ServerMsg =
  | { t: 'welcome'; you: number; code: string }
  | { t: 'full' }
  | { t: 'lobby'; code: string; phase: RoomPhase; players: LobbyPlayer[]; settings: RoomSettings; you: number }
  | { t: 'start'; mapId: BiomeId; scale: MapScale; duration: number; difficulty: Difficulty; roster: RosterNet[]; you: number; revealMs: number }
  | { t: 's'; s: SnapshotNet; m?: MeNet }
  | { t: 'results'; winner: Team; timePlayed: number; duration: number; mapId: BiomeId; entries: ResultNet[] }
  | { t: 'pong'; c: number; ts: number }
  | { t: 'error'; msg: string };

/** Datos privados de tu personaje (para el HUD y la predicción). */
export interface MeNet {
  ac: number;
  dc: number;
  sc: number;
  st: number;
  ex: number;
  en: number;
  bt: number;
  el: number;
}

export interface SnapshotNet {
  /** Tick del servidor. */
  n: number;
  /** Hora del servidor (ms). */
  ts: number;
  st: number;
  /** Tiempo restante y de partida en décimas. */
  tl: number;
  mt: number;
  /** Personajes: [id, x*10, y*10, vx, vy, fx*100, fy*100, hp, energía, flags, atrapado*10, rescate*100]. */
  c: number[][];
  /** Objetos: [iid, tipo, x, y, vida]. */
  p: number[][];
  /** Jamones lanzados: [pid, x, y, dx*100, dy*100, recorrido]. */
  j: number[][];
  /** Humo: [sid, x, y, vida*10]. */
  k: number[][];
  /** Viento (levante) en décimas de px/s. */
  w: [number, number];
  e: SimEvent[];
}

// ------------------------------------------------------------------ cliente → servidor

export type ClientMsg =
  | { t: 'hello'; pid: string; look: Look }
  | { t: 'look'; look: Look }
  | { t: 'ready'; v: boolean }
  | { t: 'settings'; s: Partial<RoomSettings> }
  | { t: 'start' }
  /** Entrada: dirección (-100..100), sprint, contadores de pulsaciones. */
  | { t: 'in'; x: number; y: number; r: number; a: number; b: number }
  | { t: 'say'; p: number }
  | { t: 'ping'; c: number }
  | { t: 'leave' };

// ------------------------------------------------------------------ codificación

export const STATES: MatchState[] = ['countdown', 'play', 'ended'];
export const PICKUPS: PickupType[] = ['medkit', 'boot', 'shield', 'gold'];

export const F = {
  alive: 1,
  bush: 2,
  shield: 4,
  boot: 8,
  dash: 16,
  invuln: 32,
  sprint: 64,
  stun: 128,
  hamHidden: 256,
  human: 512,
  trapped: 1024,
} as const;

export function encodeChar(c: SimChar): number[] {
  let f = 0;
  if (c.alive) f |= F.alive;
  if (c.inBush) f |= F.bush;
  if (c.shield) f |= F.shield;
  if (c.bootTime > 0) f |= F.boot;
  if (c.dashTime > 0) f |= F.dash;
  if (c.invuln > 0) f |= F.invuln;
  if (c.sprinting) f |= F.sprint;
  if (c.stun > 0) f |= F.stun;
  if (c.hamHidden > 0) f |= F.hamHidden;
  if (c.human) f |= F.human;
  if (c.trapped > 0) f |= F.trapped;
  return [
    c.id,
    Math.round(c.x * 10),
    Math.round(c.y * 10),
    Math.round(c.vx + c.kbx),
    Math.round(c.vy + c.kby),
    Math.round(c.fx * 100),
    Math.round(c.fy * 100),
    Math.round(c.hp),
    Math.round(c.energy),
    f,
    Math.round(Math.max(0, c.trapped) * 10),
    Math.round(c.rescueProg * 100),
  ];
}

/** Redondea los números de un evento para que ocupe menos. */
export function compactEvent(e: SimEvent): SimEvent {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(e)) out[k] = typeof v === 'number' && !Number.isInteger(v) ? Math.round(v * 100) / 100 : v;
  return out as unknown as SimEvent;
}

const LETTERS = 'ABCDEFGHJKLMNPQRSTUVWXYZ';

export function randomCode(len = 5): string {
  let s = '';
  for (let i = 0; i < len; i++) s += LETTERS[Math.floor(Math.random() * LETTERS.length)];
  return s;
}

export function validCode(code: string): boolean {
  return /^[A-Z]{5}$/.test(code);
}
