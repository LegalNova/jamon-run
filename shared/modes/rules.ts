/**
 * Reglas "puras" de cada modo: qué hace cada botón, velocidades y quién puede moverse.
 * No dependen del estado de la partida, así que las usan igual la simulación
 * (offline y servidor) y la predicción del cliente online.
 */
import { BALANCE, MODES } from '../balance';
import type { Ability, ModeId, PickupType, Team } from '../sim/types';

export interface ModeInfo {
  id: ModeId;
  name: string;
  icon: string;
  tagline: string;
  players: string;
  /** Equipo "cazador" y "presa" tal y como se llaman en este modo. */
  hunters: string;
  prey: string;
  /** Duración por defecto (s); 0 = por rondas. */
  duration: number;
  /** Se juega de noche (oscuridad + linternas). */
  night: boolean;
  /** Mapas recomendados: arenas pequeñas o mapas normales. */
  arenas: boolean;
  tutorial: { title: string; lines: string[] }[];
}

export const MODE_LIST: ModeInfo[] = [
  {
    id: 'pilla',
    name: 'PILLA JAMÓN',
    icon: 'ham',
    tagline: 'Los azules pillan, los rojos huyen y se rescatan.',
    players: '2-20',
    hunters: 'AZULES',
    prey: 'ROJOS',
    duration: MODES.pilla.duration,
    night: false,
    arenas: false,
    tutorial: [
      { title: 'HUYE', lines: ['Los rojos corren,', 'esquivan y sueltan humo.'] },
      { title: 'PILLA', lines: ['Los azules golpean', 'y lanzan jamones.'] },
      { title: 'RESCATA', lines: ['Quédate junto a un', 'compañero atrapado.'] },
      { title: 'GANA', lines: ['Aguanta el tiempo', 'o atrápalos a todos.'] },
    ],
  },
  {
    id: 'infeccion',
    name: 'INFECCIÓN',
    icon: 'virus',
    tagline: 'Un infectado. Si te toca, eres de los suyos.',
    players: '4-20',
    hunters: 'INFECTADOS',
    prey: 'SUPERVIVIENTES',
    duration: MODES.infeccion.duration,
    night: true,
    arenas: false,
    tutorial: [
      { title: 'CONTAGIO', lines: ['Un infectado al azar.', 'Si te toca, te une.'] },
      { title: 'OBJETOS', lines: ['Barrera, botas y', 'granada de humo (E).'] },
      { title: 'EL ÚLTIMO', lines: ['El último superviviente', 'sale en el radar.'] },
      { title: 'LEYENDA', lines: ['Aguanta 2:30 y', 'serás una LEYENDA.'] },
    ],
  },
  {
    id: 'bomba',
    name: 'JAMÓN BOMBA',
    icon: 'bomb',
    tagline: 'Pásalo antes de que explote. Queda uno.',
    players: '3-20',
    hunters: 'CON BOMBA',
    prey: 'SIN BOMBA',
    duration: 0,
    night: false,
    arenas: true,
    tutorial: [
      { title: 'PÁSALO', lines: ['Toca a alguien para', 'pasarle el jamón.'] },
      { title: 'MECHA', lines: ['Mecha oculta 15-25 s.', 'Escucha cómo se acelera.'] },
      { title: '¡BUM!', lines: ['Si te explota encima,', 'quedas fuera.'] },
      { title: 'RONDAS', lines: ['Ronda tras ronda', 'hasta que quede uno.'] },
    ],
  },
  {
    id: 'escondite',
    name: 'ESCONDITE JAMONERO',
    icon: 'box',
    tagline: 'Conviértete en papelera. Que no te pillen.',
    players: '3-20',
    hunters: 'BUSCADORES',
    prey: 'ESCONDIDOS',
    duration: MODES.escondite.duration,
    night: true,
    arenas: false,
    tutorial: [
      { title: 'ESCÓNDETE', lines: ['30 s para esconderte.', 'Los buscadores no ven.'] },
      { title: 'DISFRAZ', lines: ['E: conviértete en objeto.', 'R: gira. SHIFT: quieto.'] },
      { title: 'PISTAS', lines: ['Cada 20 s haces un', 'ruidito. ¡Cuidado!'] },
      { title: 'BUSCA', lines: ['Golpea objetos. Si es', 'real, te haces daño.'] },
    ],
  },
];

export function modeInfo(id: ModeId): ModeInfo {
  return MODE_LIST.find((m) => m.id === id) ?? MODE_LIST[0];
}

export function validMode(id: unknown): id is ModeId {
  return typeof id === 'string' && MODE_LIST.some((m) => m.id === id);
}

/** Cuántos cazadores hay al empezar con este número total de personajes. */
export function defaultHunters(mode: ModeId, total: number): number {
  switch (mode) {
    case 'bomba':
      return 0;
    case 'infeccion':
      return Math.max(1, Math.min(total - 1, MODES.infeccion.startInfected));
    case 'escondite':
      return Math.max(1, Math.min(total - 1, Math.round(total * 0.35)));
    default:
      // Pilla: con bots, ~3 azules por cada 5 rojos queda equilibrado.
      return Math.max(1, Math.min(total - 1, Math.round(total * 0.38)));
  }
}

/** ¿Puede esprintar? (Los infectados no: ya son un 10% más rápidos.) */
export function canSprintFor(mode: ModeId, team: Team): boolean {
  return !(mode === 'infeccion' && team === 'chaser');
}

type AbilityChar = Readonly<{ team: Team; disguise: number; heldItem: PickupType | null; bomb: boolean }>;

/** Qué hace cada botón (acción = ESPACIO, especial = E). */
export function abilityFor(mode: ModeId, c: AbilityChar, slot: 'action' | 'special'): Ability {
  const hunter = c.team === 'chaser';
  switch (mode) {
    case 'pilla':
      return slot === 'action' ? (hunter ? 'attack' : 'dash') : hunter ? 'throw' : 'smoke';
    case 'infeccion':
      // Los infectados se abalanzan (dash); los supervivientes usan objetos.
      return slot === 'action' ? 'dash' : hunter ? 'none' : 'item';
    case 'bomba':
      return slot === 'action' ? 'dash' : 'none';
    case 'escondite':
      if (hunter) return slot === 'action' ? 'attack' : 'none';
      return slot === 'action' ? (c.disguise >= 0 ? 'none' : 'dash') : 'disguise';
  }
}

/** Multiplicador de velocidad propio del modo. */
export function speedMulFor(mode: ModeId, c: Readonly<{ team: Team; disguise: number; bomb: boolean }>): number {
  switch (mode) {
    case 'infeccion':
      return c.team === 'chaser' ? MODES.infeccion.infectedSpeed : 1;
    case 'bomba':
      return c.bomb ? MODES.bomba.holderSpeed : 1;
    case 'escondite':
      return c.disguise >= 0 ? MODES.escondite.disguisedSpeed : 1;
    default:
      return 1;
  }
}

/** ¿Usa el perfil de movimiento del perseguidor clásico (más lento, impulso en recta)? */
export function usesChaserProfile(mode: ModeId, team: Team): boolean {
  return team === 'chaser' && (mode === 'pilla' || mode === 'escondite');
}

/**
 * ¿Se puede mover? `phase` es la fase del modo (Escondite: 0 = esconderse).
 */
export function canMoveFor(mode: ModeId, team: Team, matchTime: number, phase: number): boolean {
  if (team !== 'chaser') return true;
  if (mode === 'escondite') return phase !== 0;
  if (mode === 'bomba') return true;
  return matchTime >= BALANCE.match.chaserReleaseDelay;
}
