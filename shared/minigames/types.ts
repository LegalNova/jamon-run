/**
 * Interfaz común de los minijuegos del Parón (intro → jugar → puntuar → resultado).
 * Cada minijuego es un módulo de /shared/minigames: los ejecuta el servidor (online)
 * o el navegador (offline y Sala de minijuegos) exactamente igual.
 */
import type { Team } from '../sim/types';

export type MgId = 'ruleta' | 'caballos' | 'corta' | 'torre' | 'tira' | 'trilero' | 'reflejos' | 'ritmo' | 'atrapa' | 'cuenta';

export interface MgPlayer {
  id: number;
  name: string;
  team: Team;
  bot: boolean;
}

/** Entradas: a = ESPACIO, b = E, l/r = flechas izquierda/derecha. */
export type MgKey = 'a' | 'b' | 'l' | 'r';

export interface MgResult {
  id: number;
  score: number;
  /** 0 = primero. En Tira y Afloja todo el equipo ganador es primero. */
  place: number;
  won: boolean;
  /** Lo que se enseña en el podio ("312 MS", "8 PISOS", "+40 FICHAS"...). */
  label: string;
  /** Lonchas extra por apuestas ganadas (ruleta, caballos). */
  bonus: number;
  /** Para las misiones (cortes perfectos...). */
  perfects?: number;
}

export interface MiniGame {
  readonly id: MgId;
  /** Segundos de juego. */
  readonly duration: number;
  /** Segundos desde que empezó a jugarse. */
  t: number;
  done: boolean;
  /** Una tecla pulsada en el instante `t` (ya compensado el ping en online). */
  input(id: number, k: MgKey, t: number): void;
  tick(dt: number): void;
  /** Estado público (viaja por la red; nada que permita hacer trampas). */
  state(): Record<string, unknown>;
  results(): MgResult[];
  /** Qué hacen los bots en este instante. */
  bot(id: number, dt: number): MgKey[];
}

export interface MgDef {
  id: MgId;
  name: string;
  /** Explicación de 2 segundos (dos líneas) y teclas. */
  howto: [string, string];
  keys: string;
  color: number;
  create(players: MgPlayer[], rng: () => number, extra: MgExtra): MiniGame;
}

export interface MgExtra {
  /** Últimos números de la ruleta (historial de la sala). */
  rouletteHistory: string[];
}

export const pingpong = (x: number): number => 1 - Math.abs((((x % 2) + 2) % 2) - 1);

/** Ordena por puntuación y asigna puestos (empates comparten puesto). */
export function rank(players: MgPlayer[], score: (id: number) => number, label: (id: number) => string, higherBetter = true, bonus: (id: number) => number = () => 0): MgResult[] {
  const arr = players.map((p) => ({ id: p.id, score: score(p.id) }));
  arr.sort((a, b) => (higherBetter ? b.score - a.score : a.score - b.score));
  let place = 0;
  return arr.map((r, i) => {
    if (i > 0 && r.score !== arr[i - 1].score) place = i;
    return { id: r.id, score: r.score, place, won: place === 0, label: label(r.id), bonus: bonus(r.id) };
  });
}
