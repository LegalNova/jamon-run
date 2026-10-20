import { MAP_SCALE } from './balance';
import { BiomeId, getMap } from './maps';

export interface MapScale {
  sx: number;
  sy: number;
}

/** Tamaño del mapa según el número total de personajes (jugadores + bots). */
export function scaleFor(players: number): MapScale {
  const s = MAP_SCALE.find((m) => players <= m.maxPlayers) ?? MAP_SCALE[MAP_SCALE.length - 1];
  return { sx: s.sx, sy: s.sy };
}

const rev = (s: string) => s.split('').reverse().join('');

/**
 * Construye las filas del mapa escalado repitiéndolo en espejo.
 * Se quita el muro del borde en la costura para que las copias queden unidas.
 */
export function buildRows(mapId: BiomeId, scale: MapScale): string[] {
  let rows = getMap(mapId).rows;
  if (scale.sx >= 2) rows = rows.map((r) => r.slice(0, -1) + rev(r).slice(1));
  if (scale.sy >= 2) rows = [...rows.slice(0, -1), ...[...rows].reverse().slice(1)];
  return rows;
}
