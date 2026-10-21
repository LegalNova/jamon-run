import { MAP_SCALE } from './balance';
import { Grid } from './grid';
import { getMap, MapId } from './maps';

export interface MapScale {
  sx: number;
  sy: number;
}

/** Tamaño del mapa según el número total de personajes (jugadores + bots). */
export function scaleFor(players: number, mapId?: MapId): MapScale {
  // Las arenas son pequeñas a propósito: como mucho se duplican a lo ancho.
  if (mapId && getMap(mapId).arena) return players > 12 ? { sx: 2, sy: 1 } : { sx: 1, sy: 1 };
  const s = MAP_SCALE.find((m) => players <= m.maxPlayers) ?? MAP_SCALE[MAP_SCALE.length - 1];
  return { sx: s.sx, sy: s.sy };
}

const rev = (s: string) => s.split('').reverse().join('');

function connected(rows: string[]): boolean {
  const g = new Grid(rows);
  const start = g.chaserSpawns[0] ?? g.passable[0];
  const f = g.dijkstra([start]);
  return g.passable.every((i) => Number.isFinite(f.dist[i]));
}

const cache = new Map<string, string[]>();

/**
 * Construye las filas del mapa escalado repitiéndolo en espejo.
 * Se quita el muro del borde en la costura para que las copias queden unidas,
 * y se elige el lado de la costura que deja el mapa conectado (p. ej. no unir
 * por el mar en Barcelona).
 */
export function buildRows(mapId: MapId, scale: MapScale): string[] {
  const key = `${mapId}:${scale.sx}x${scale.sy}`;
  const hit = cache.get(key);
  if (hit) return hit;
  let rows = getMap(mapId).rows;
  if (scale.sx >= 2) {
    const right = rows.map((r) => r.slice(0, -1) + rev(r).slice(1));
    const left = rows.map((r) => rev(r).slice(0, -1) + r.slice(1));
    rows = connected(right) ? right : left;
  }
  if (scale.sy >= 2) {
    const below = [...rows.slice(0, -1), ...[...rows].reverse().slice(1)];
    const above = [...[...rows].reverse().slice(0, -1), ...rows.slice(1)];
    rows = connected(below) ? below : above;
  }
  cache.set(key, rows);
  return rows;
}
