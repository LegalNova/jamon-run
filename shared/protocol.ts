/**
 * Protocolo de red (WebSocket, JSON compacto).
 * El servidor es autoritativo: el cliente solo envía entradas y peticiones.
 */
import type { Difficulty } from './balance';
import type { ApplyResult, Equipped } from './economy';
import type { MgKey, ParonNet } from './minigames';
import type { Look } from './look';
import type { MapId } from './maps';
import type { MapScale } from './mapScale';
import type { ModeNet } from './modes/types';
import type { SimChar } from './sim/Char';
import type { MatchState, ModeId, PickupType, SimEvent, Stats, Team } from './sim/types';

export interface RoomSettings {
  /** Modo elegido por el anfitrión, o 'voto' (gana el más votado en el lobby). */
  mode: ModeId | 'voto';
  /** Cazadores al empezar (buscadores / infectados / azules); 0 = automático. */
  hunters: number;
  mapId: MapId;
  /** Parón Dopamina activado. */
  paron: boolean;
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
  /** Voto de modo. */
  vote: ModeId | null;
  /** Cosméticos puestos (comprobados por el servidor) y racha de minijuegos. */
  cos: Equipped;
  streak: number;
}

export type RoomPhase = 'lobby' | 'reveal' | 'playing' | 'results';

export interface RosterNet {
  id: number;
  name: string;
  team: Team;
  look: Look;
  human: boolean;
  cos?: Equipped;
  streak?: number;
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
  | { t: 'start'; mode: ModeId; seed: number; mapId: MapId; scale: MapScale; duration: number; difficulty: Difficulty; roster: RosterNet[]; you: number; revealMs: number }
  | { t: 's'; s: SnapshotNet; m?: MeNet }
  | { t: 'results'; mode: ModeId; winner: Team; champion: number; timePlayed: number; duration: number; mapId: MapId; entries: ResultNet[] }
  | { t: 'pong'; c: number; ts: number }
  /** Lo que has ganado en la partida (lo calcula el servidor). */
  | { t: 'reward'; res: ApplyResult }
  /** Estado del Parón (minijuego) y reacciones (1-5). */
  | { t: 'mg'; p: ParonNet }
  | { t: 're'; id: number; e: number }
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
  /** Tiradas personales de ruleta que te quedan. */
  sp: number;
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
  /** Personajes: [id, x*10, y*10, vx, vy, fx*100, fy*100, hp, energía, flags, atrapado*10, rescate*100, equipo, disfraz, giro, flags2]. */
  c: number[][];
  /** Objetos: [iid, tipo, x, y, vida]. */
  p: number[][];
  /** Jamones lanzados: [pid, x, y, dx*100, dy*100, recorrido]. */
  j: number[][];
  /** Humo: [sid, x, y, vida*10]. */
  k: number[][];
  /** Viento (levante) en décimas de px/s. */
  w: [number, number];
  /** Estado del modo (fase, rondas, jamones bomba, efecto de la ruleta...). */
  ms: ModeNet;
  e: SimEvent[];
}

// ------------------------------------------------------------------ cliente → servidor

export type ClientMsg =
  | { t: 'hello'; pid: string; look: Look; acct?: string }
  | { t: 'look'; look: Look }
  | { t: 'ready'; v: boolean }
  | { t: 'settings'; s: Partial<RoomSettings> }
  | { t: 'start' }
  /** Entrada: dirección (-100..100), sprint, contadores de pulsaciones (acción, especial, girar, ruleta). */
  | { t: 'in'; x: number; y: number; r: number; a: number; b: number; o?: number; q?: number }
  | { t: 'vote'; m: ModeId }
  | { t: 'say'; p: number }
  | { t: 'emo' }
  /** Tecla en el minijuego (p = tu ping en ms, para compensar). */
  | { t: 'mi'; k: MgKey; p?: number }
  | { t: 're'; e: number }
  | { t: 'ping'; c: number }
  | { t: 'leave' };

// ------------------------------------------------------------------ codificación

export const STATES: MatchState[] = ['countdown', 'play', 'ended'];
export const PICKUPS: PickupType[] = ['medkit', 'boot', 'shield', 'gold', 'barrier', 'grenade', 'coin'];

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

/** Segundo bloque de flags (modos y ruleta). */
export const F2 = {
  bomb: 1,
  perkSpeed: 64,
  perkCd: 128,
  anchored: 2,
  invisible: 4,
  barrier: 8,
  grenade: 16,
  dashFree: 32,
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
  let f2 = 0;
  if (c.bomb) f2 |= F2.bomb;
  if (c.anchored) f2 |= F2.anchored;
  if (c.invisible > 0) f2 |= F2.invisible;
  if (c.heldItem === 'barrier') f2 |= F2.barrier;
  if (c.heldItem === 'grenade') f2 |= F2.grenade;
  if (c.dashFree > 0) f2 |= F2.dashFree;
  if (c.perk === 'speed') f2 |= F2.perkSpeed;
  if (c.perk === 'cooldown') f2 |= F2.perkCd;
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
    c.team === 'chaser' ? 1 : 0,
    c.disguise,
    c.rot,
    f2,
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
