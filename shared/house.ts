/**
 * LA CASA (Escondite): habitaciones, puertas que se abren solas e interruptores de luz.
 * Todo se calcula a partir de la cuadrícula, así que el servidor y los clientes ven lo mismo.
 */
import { HOUSE, TILE } from './balance';
import type { Grid } from './grid';

export interface Room {
  tiles: number[];
  switches: number[];
  /** Rectángulos (en tiles) que cubren la habitación, para dibujar la luz. */
  rects: [number, number, number, number][];
}

export interface HouseLayout {
  /** Habitación de cada tile (-1 = pared, puerta o fuera). */
  roomOf: Int16Array;
  rooms: Room[];
}

const cache = new WeakMap<Grid, HouseLayout | null>();

/** Habitaciones de un mapa con interruptores ('J'); null si no es una casa. */
export function houseLayout(grid: Grid): HouseLayout | null {
  if (cache.has(grid)) return cache.get(grid)!;
  let out: HouseLayout | null = null;
  if (grid.chars.some((r) => r.includes('J'))) {
    const roomOf = new Int16Array(grid.w * grid.h).fill(-1);
    const rooms: Room[] = [];
    for (const start of grid.passable) {
      if (roomOf[start] >= 0 || grid.charAt(start % grid.w, (start / grid.w) | 0) === 'D') continue;
      const id = rooms.length;
      const room: Room = { tiles: [], switches: [], rects: [] };
      const stack = [start];
      roomOf[start] = id;
      while (stack.length) {
        const i = stack.pop()!;
        room.tiles.push(i);
        const x = i % grid.w;
        const y = (i / grid.w) | 0;
        if (grid.charAt(x, y) === 'J') room.switches.push(i);
        for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          const nx = x + dx;
          const ny = y + dy;
          if (!grid.inBounds(nx, ny)) continue;
          const n = ny * grid.w + nx;
          if (roomOf[n] >= 0 || grid.charAt(nx, ny) === 'D' || '#'.includes(grid.charAt(nx, ny))) continue;
          // Los muebles sólidos (mesas, encimeras, coches) también son de la habitación.
          roomOf[n] = id;
          stack.push(n);
        }
      }
      // Filas de tiles seguidos → rectángulos de 1 tile de alto.
      const byRow = new Map<number, number[]>();
      for (const i of room.tiles) {
        const y = (i / grid.w) | 0;
        (byRow.get(y) ?? byRow.set(y, []).get(y)!).push(i % grid.w);
      }
      for (const [y, xs] of byRow) {
        xs.sort((a, b) => a - b);
        let x0 = xs[0];
        let prev = xs[0];
        for (const x of [...xs.slice(1), Infinity]) {
          if (x !== prev + 1) {
            room.rects.push([x0, y, prev - x0 + 1, 1]);
            x0 = x;
          }
          prev = x;
        }
      }
      rooms.push(room);
    }
    out = { roomOf, rooms };
  }
  cache.set(grid, out);
  return out;
}

/** Abre las puertas que tienen a alguien cerca y cierra el resto. Devuelve true si ha cambiado alguna. */
export function updateDoors(grid: Grid, chars: Iterable<{ x: number; y: number; alive?: boolean }>): boolean {
  if (!grid.doorTiles.length) return false;
  const R = HOUSE.doorRadius;
  const open = new Set<number>();
  for (const c of chars) {
    if (c.alive === false) continue;
    const tx0 = Math.floor((c.x - R) / TILE);
    const tx1 = Math.floor((c.x + R) / TILE);
    const ty0 = Math.floor((c.y - R) / TILE);
    const ty1 = Math.floor((c.y + R) / TILE);
    for (let ty = ty0; ty <= ty1; ty++)
      for (let tx = tx0; tx <= tx1; tx++) {
        if (grid.charAt(tx, ty) !== 'D') continue;
        const cx = tx * TILE + TILE / 2;
        const cy = ty * TILE + TILE / 2;
        if ((cx - c.x) ** 2 + (cy - c.y) ** 2 <= R * R) open.add(ty * grid.w + tx);
      }
  }
  let changed = false;
  for (const i of grid.doorTiles) {
    const v = open.has(i) ? 0 : 1;
    if (grid.doorClosed[i] !== v) {
      grid.doorClosed[i] = v;
      changed = true;
    }
  }
  return changed;
}

/** Luces encendidas como lista de números de 30 bits (para el snapshot). */
export function packLights(lights: Uint8Array): number[] {
  const out: number[] = [];
  for (let i = 0; i < lights.length; i += 30) {
    let n = 0;
    for (let b = 0; b < 30 && i + b < lights.length; b++) if (lights[i + b]) n |= 1 << b;
    out.push(n);
  }
  return out;
}

export function lightOn(packed: number[] | undefined, room: number): boolean {
  if (!packed) return true;
  const n = packed[Math.floor(room / 30)];
  return n === undefined ? true : ((n >> (room % 30)) & 1) === 1;
}
