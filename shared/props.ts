/**
 * Objetos del mapa para el Escondite Jamonero.
 * Se generan con una semilla: el servidor y todos los clientes obtienen los mismos.
 * No son sólidos (si lo fueran, un buscador sabría cuál es real chocándose).
 */
import { MODES, TILE } from './balance';
import { Grid, Terrain } from './grid';

export const PROP_KINDS = [
  'papelera', 'farola', 'maceta', 'caja', 'silla', 'barril', 'banco', 'cubo',
  // muebles de la casa
  'sofa', 'lampara', 'nevera', 'lavadora', 'cama', 'armario', 'tele', 'bici',
] as const;
export type PropKind = (typeof PROP_KINDS)[number];

const kindIndex = (k: PropKind) => PROP_KINDS.indexOf(k);
/** Objetos de la calle y de la casa (en la casa solo hay muebles). */
export const STREET_KINDS = [0, 1, 2, 3, 4, 5, 6, 7];
export const HOUSE_KINDS = (['sofa', 'lampara', 'nevera', 'lavadora', 'cama', 'armario', 'tele', 'bici', 'maceta', 'caja'] as PropKind[]).map(kindIndex);
/** Muebles fijos de la casa: dígito del mapa → tipo. */
const DIGIT_KIND: Record<string, PropKind> = { '1': 'sofa', '2': 'lampara', '3': 'nevera', '4': 'lavadora', '5': 'cama', '6': 'armario', '7': 'maceta', '8': 'tele', '9': 'caja', '0': 'bici' };
/** Objetos que dan luz de noche (farola y lámpara). */
export const LIGHT_KINDS = [kindIndex('farola'), kindIndex('lampara')];

/** ¿Es un mapa con muebles (la casa)? */
export function isHouse(grid: Grid): boolean {
  return grid.chars.some((r) => r.some((c) => c in DIGIT_KIND));
}

export function kindsFor(grid: Grid): number[] {
  return isHouse(grid) ? HOUSE_KINDS : STREET_KINDS;
}

export interface Prop {
  k: number;
  x: number;
  y: number;
  rot: number;
}

/** Generador pseudoaleatorio determinista (mulberry32). */
export function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function buildProps(grid: Grid, seed: number): Prop[] {
  const r = rng(seed);
  const out: Prop[] = [];
  const kinds = kindsFor(grid);
  const used = new Set<number>();
  // La casa: los muebles que vienen dibujados en el mapa.
  for (const t of grid.passable) {
    const x = t % grid.w;
    const y = (t / grid.w) | 0;
    const kind = DIGIT_KIND[grid.chars[y][x]];
    if (!kind) continue;
    used.add(t);
    out.push({ k: kindIndex(kind), x: x * TILE + TILE / 2, y: y * TILE + TILE / 2 + 2, rot: Math.floor(r() * 4) });
  }
  const fixed = out.length;
  const ok = (t: number) => {
    const ter = grid.terrain[t];
    if (ter !== Terrain.Ground && ter !== Terrain.Bush) return false;
    const x = t % grid.w;
    const y = (t / grid.w) | 0;
    const c = grid.chars[y][x];
    return c !== 'X' && c !== 'M' && c !== 'D' && c !== 'J';
  };
  const cand = grid.passable.filter(ok);
  // Barajado determinista.
  for (let i = cand.length - 1; i > 0; i--) {
    const j = Math.floor(r() * (i + 1));
    [cand[i], cand[j]] = [cand[j], cand[i]];
  }
  // En la casa, además de los muebles fijos, unos pocos más repartidos.
  const want = fixed ? fixed + Math.floor(fixed * 0.3) : Math.floor(cand.length / MODES.escondite.propDensity);
  for (const t of cand) {
    if (out.length >= want) break;
    const x = t % grid.w;
    const y = (t / grid.w) | 0;
    // Nada pegado a otro objeto.
    let near = false;
    for (let dy = -1; dy <= 1 && !near; dy++) for (let dx = -1; dx <= 1; dx++) if (used.has((y + dy) * grid.w + x + dx)) near = true;
    if (near) continue;
    // Preferimos sitios junto a paredes (como en una calle de verdad), pero no siempre.
    let walls = 0;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) if (!grid.walkable(x + dx, y + dy)) walls++;
    if (walls === 0 && r() < 0.45) continue;
    used.add(t);
    // Agrupa por tipo según la zona para que parezca un mobiliario urbano coherente.
    const zone = ((x >> 3) * 7 + (y >> 3) * 13) % kinds.length;
    const k = kinds[r() < 0.55 ? zone : Math.floor(r() * kinds.length)];
    out.push({
      k,
      x: x * TILE + TILE / 2 + Math.round((r() - 0.5) * 6),
      y: y * TILE + TILE / 2 + Math.round((r() - 0.5) * 6),
      rot: Math.floor(r() * 4),
    });
  }
  return out;
}
