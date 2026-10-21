import Phaser from 'phaser';
import { TILE } from '../config/balance';
import { PAL } from './palette';
import { gridTexture, PixelGrid } from './pixel';
import type { TileCtx } from './tiles';

/**
 * LAS VEGAS: avenida de noche, casinos con neón, tragaperras, coches y un parking de dos plantas.
 * Paleta de noche: morados, rosas y dorados.
 */

export const VEGAS = {
  asphalt: ['#262131', '#2c2638', '#221d2c'],
  line: '#e8b23a',
  walk: ['#4a3460', '#553c6d'],
  grout: '#7a5a9a',
  curb: '#b9a4d0',
  park: ['#4a485c', '#524f66', '#444256'],
  parkLine: '#e6e2f0',
  neon: ['#ff4fd8', '#3ff0ff', '#fee761', '#b26bff', '#ff6b6b', '#5aff8a'],
};

const at = (t: TileCtx, dx: number, dy: number) => t.grid.charAt(t.tx + dx, t.ty + dy);
const GROUNDS = '.,z';

/** Suelo de un tile que no es suelo (palmera, tragaperras, coche...): el de alrededor. */
function baseOf(t: TileCtx): string {
  const c = at(t, 0, 0);
  if (GROUNDS.includes(c)) return c;
  const n = [at(t, 0, 1), at(t, 0, -1), at(t, -1, 0), at(t, 1, 0), at(t, 1, 1), at(t, -1, -1)];
  let best = '.';
  let bn = 0;
  for (const g of GROUNDS) {
    const k = n.filter((x) => x === g).length;
    if (k > bn) {
      bn = k;
      best = g;
    }
  }
  return c === 'I' || c === 'M' ? 'z' : best;
}

/** Cuántos tiles de calzada seguidos hay hacia arriba/abajo (para pintar la línea del centro). */
function run(t: TileCtx, dy: number): number {
  let n = 0;
  while (n < 8 && at(t, 0, dy * (n + 1)) === '.') n++;
  return n;
}

function asphalt(t: TileCtx): void {
  const { r, ox, oy, rand } = t;
  for (let y = 0; y < TILE; y++)
    for (let x = 0; x < TILE; x++) {
      const n = rand();
      r.set(ox + x, oy + y, n < 0.08 ? VEGAS.asphalt[1] : n < 0.14 ? VEGAS.asphalt[2] : VEGAS.asphalt[0]);
    }
  // Línea dorada discontinua en el centro de las avenidas (no en los callejones).
  const horiz = '.VXo'.includes(at(t, -1, 0)) && '.VXo'.includes(at(t, 1, 0));
  if (!horiz) return;
  const up = run(t, -1);
  const down = run(t, 1);
  if (up + down + 1 < 3) return;
  const y = up === down ? 7 : down === up + 1 ? 15 : -1;
  if (y < 0) return;
  for (let x = 0; x < TILE; x++) if ((t.tx * TILE + x) % 8 < 5) r.set(ox + x, oy + y, VEGAS.line);
}

function walk(t: TileCtx): void {
  const { r, ox, oy, rand } = t;
  for (let y = 0; y < TILE; y++)
    for (let x = 0; x < TILE; x++) {
      const gx = t.tx * TILE + x;
      const gy = t.ty * TILE + y;
      const cell = (Math.floor(gx / 8) + Math.floor(gy / 8)) % 2;
      let c = VEGAS.walk[cell];
      if (gx % 8 === 0 || gy % 8 === 0) c = VEGAS.grout;
      else if (rand() < 0.04) c = '#6a4c84';
      r.set(ox + x, oy + y, c);
    }
  // Bordillo donde empieza la calzada.
  if (at(t, 0, 1) === '.' || at(t, 0, 1) === 'V') for (let x = 0; x < TILE; x++) {
    r.set(ox + x, oy + TILE - 2, VEGAS.curb);
    r.set(ox + x, oy + TILE - 1, '#3a2f48');
  }
  if (at(t, 0, -1) === '.' || at(t, 0, -1) === 'V') for (let x = 0; x < TILE; x++) r.set(ox + x, oy, VEGAS.curb);
  // Estrellas doradas en el suelo (paseo de la fama) de vez en cuando.
  if (rand() < 0.06) {
    const cx = ox + 5 + Math.floor(rand() * 6);
    const cy = oy + 5 + Math.floor(rand() * 6);
    for (const [dx, dy] of [[0, 0], [1, 0], [-1, 0], [0, 1], [0, -1]]) r.set(cx + dx, cy + dy, '#fee761');
  }
}

function parking(t: TileCtx): void {
  const { r, ox, oy, rand } = t;
  for (let y = 0; y < TILE; y++)
    for (let x = 0; x < TILE; x++) {
      const n = rand();
      r.set(ox + x, oy + y, n < 0.08 ? VEGAS.park[1] : n < 0.13 ? VEGAS.park[2] : VEGAS.park[0]);
    }
  // Plazas pintadas cada dos tiles.
  if (t.tx % 2 === 0) for (let y = 2; y < 14; y++) r.set(ox, oy + y, VEGAS.parkLine);
  if (rand() < 0.08) {
    // mancha de aceite
    const cx = ox + 4 + Math.floor(rand() * 8);
    const cy = oy + 4 + Math.floor(rand() * 8);
    for (let k = 0; k < 6; k++) r.set(cx + Math.floor(rand() * 3), cy + Math.floor(rand() * 2), '#35334a');
  }
}

function ground(t: TileCtx): void {
  const b = baseOf(t);
  if (b === ',') walk(t);
  else if (b === 'z') parking(t);
  else asphalt(t);
}

/** Color de neón de un casino (el mismo en todo el edificio). */
export function casinoColor(grid: TileCtx['grid'], tx: number, ty: number): string {
  let x = tx;
  let y = ty;
  while (grid.charAt(x - 1, y) === 'N') x--;
  while (grid.charAt(x, y - 1) === 'N') y--;
  return VEGAS.neon[(x * 7 + y * 3) % VEGAS.neon.length];
}

function casino(t: TileCtx): void {
  const { r, ox, oy, rand } = t;
  const isN = (dx: number, dy: number) => at(t, dx, dy) === 'N';
  const below = isN(0, 1);
  const faceH = below ? 0 : 7;
  const neon = casinoColor(t.grid, t.tx, t.ty);
  for (let y = 0; y < TILE; y++)
    for (let x = 0; x < TILE; x++) {
      const gx = t.tx * TILE + x;
      const gy = t.ty * TILE + y;
      let c: string;
      if (y >= TILE - faceH) {
        // fachada: ventanas iluminadas y tira de neón abajo
        const fy = y - (TILE - faceH);
        c = '#2d1f3d';
        if (fy === 0) c = '#140d1c';
        if (gx % 4 === 1 && fy >= 2 && fy <= 4) c = (gx >> 2) % 3 === 0 ? '#ff9ad8' : '#fee761';
        if (fy === 6) c = neon;
      } else {
        // azotea: oscura con dibujo de rombos
        c = (gx + gy) % 6 === 0 || (gx - gy + 600) % 6 === 0 ? '#251a33' : '#1c1426';
        if (rand() < 0.02) c = '#3a2a4e';
      }
      r.set(ox + x, oy + y, c);
    }
  // borde de neón alrededor de la azotea
  const top = TILE - faceH;
  if (!isN(0, -1)) for (let x = 0; x < TILE; x++) {
    r.set(ox + x, oy, neon);
    r.set(ox + x, oy + 1, '#c9a04a');
  }
  if (!isN(-1, 0)) for (let y = 0; y < top; y++) r.set(ox, oy + y, neon);
  if (!isN(1, 0)) for (let y = 0; y < top; y++) r.set(ox + TILE - 1, oy + y, neon);
  // aparatos de aire en la azotea
  if (below && rand() < 0.18) {
    const x = ox + 3 + Math.floor(rand() * 8);
    const y = oy + 3 + Math.floor(rand() * 8);
    for (let j = 0; j < 3; j++) for (let i = 0; i < 4; i++) r.set(x + i, y + j, j === 0 ? '#8b9bb4' : '#5a6378');
  }
}

function pillar(t: TileCtx): void {
  parking(t);
  const { r, ox, oy } = t;
  for (let y = 2; y < 15; y++)
    for (let x = 3; x < 13; x++) {
      let c = y < 10 ? '#a8a6b8' : '#6e6c80';
      if (y >= 12 && (x + y) % 4 < 2) c = '#fee761';
      else if (y >= 12) c = '#262033';
      if (x === 3 || x === 12 || y === 2) c = '#3a3848';
      r.set(ox + x, oy + y, c);
    }
}

function lift(t: TileCtx): void {
  parking(t);
  const { r, ox, oy } = t;
  for (let y = 1; y < 15; y++)
    for (let x = 2; x < 14; x++) {
      let c = x === 7 || x === 8 ? '#4a5470' : '#9aa7bf';
      if (x === 2 || x === 13 || y === 1) c = '#c9a04a';
      r.set(ox + x, oy + y, c);
    }
  // flechas arriba/abajo
  const G = '#fee761';
  [[4, 5], [5, 4], [6, 5], [5, 5], [5, 6], [9, 9], [10, 10], [11, 9], [10, 9], [10, 8]].forEach(([x, y]) => r.set(ox + x, oy + y, G));
}

/** Dibuja un tile de Las Vegas. Devuelve false si el mapa no es Las Vegas. */
export function drawVegasTile(t: TileCtx, water: (t: TileCtx) => void): boolean {
  if (t.id !== 'vegas') return false;
  switch (at(t, 0, 0)) {
    case 'N':
      casino(t);
      break;
    case '~':
      water(t);
      break;
    case 'I':
      pillar(t);
      break;
    case 'M':
      lift(t);
      break;
    case 'V': {
      ground(t);
      // sombra del coche
      for (let y = 11; y < 16; y++) for (let x = 1; x < 15; x++) t.r.set(t.ox + x, t.oy + y, '#1a1622');
      break;
    }
    case 'Y':
    case 'T': {
      ground(t);
      for (let y = 11; y < 16; y++)
        for (let x = 3; x < 13; x++) {
          const dx = (x - 8) / 5;
          const dy = (y - 13.5) / 2.5;
          if (dx * dx + dy * dy <= 1) t.r.set(t.ox + x, t.oy + y, '#1a1622');
        }
      break;
    }
    default:
      ground(t);
  }
  return true;
}

// ------------------------------------------------------------------ sprites

function slotMachine(scene: Phaser.Scene, key: string, body: string, trim: string): void {
  const g = new PixelGrid(14, 24);
  g.rect(1, 6, 12, 17, body);
  g.rect(1, 6, 12, 1, trim);
  g.rect(2, 9, 10, 6, '#f4f0e8');
  // tres rodillos: cereza, 7, campana
  g.rect(4, 9, 1, 6, '#c2c3c7');
  g.rect(8, 9, 1, 6, '#c2c3c7');
  g.set(2, 11, '#d8222c');
  g.set(3, 12, '#d8222c');
  g.set(2, 12, '#a01828');
  g.rect(5, 10, 3, 1, '#d8222c');
  g.set(7, 11, '#d8222c');
  g.set(6, 12, '#d8222c');
  g.set(6, 13, '#d8222c');
  g.rect(9, 11, 3, 2, '#fee761');
  g.set(10, 10, '#fee761');
  g.set(10, 13, '#feae34');
  g.rect(2, 17, 10, 2, trim);
  g.rect(3, 20, 8, 2, '#262033');
  // luz de arriba y palanca
  g.ellipse(7, 3.5, 3, 2.5, '#ff4fd8');
  g.set(6, 2, '#ffd0f4');
  g.rect(13, 8, 1, 6, '#c2c3c7');
  g.set(13, 7, '#d8222c');
  g.outline(PAL.outline);
  gridTexture(scene, key, g);
}

function car(scene: Phaser.Scene, key: string, body: string, dark: string, roof: string): void {
  const W = 32;
  const g = new PixelGrid(W + 2, 22);
  // carrocería vista desde arriba en 3/4
  g.rect(2, 8, W - 2, 10, body);
  g.rect(2, 16, W - 2, 2, dark);
  g.rect(8, 3, 16, 6, roof);
  g.rect(9, 4, 6, 4, '#7cc8ff');
  g.rect(17, 4, 6, 4, '#5aa8e0');
  g.rect(1, 10, 1, 5, dark);
  g.rect(W, 10, 1, 5, dark);
  // faros y pilotos
  g.rect(W - 1, 10, 1, 2, '#fee761');
  g.rect(2, 10, 1, 2, '#ff4040');
  // ruedas
  g.rect(5, 17, 5, 3, '#1a1622');
  g.rect(W - 9, 17, 5, 3, '#1a1622');
  g.rect(3, 12, W - 4, 1, '#ffffff');
  g.outline(PAL.outline);
  gridTexture(scene, key, g);
}

function liftSign(scene: Phaser.Scene): void {
  const g = new PixelGrid(9, 18);
  g.rect(4, 8, 1, 10, '#5a6378');
  g.rect(0, 0, 9, 9, '#2d1f3d');
  g.rect(1, 1, 7, 7, '#c9a04a');
  [[4, 2], [3, 3], [5, 3], [4, 3], [4, 4], [4, 5], [3, 5], [5, 5], [4, 6]].forEach(([x, y]) => g.set(x, y, '#140d1c'));
  g.outline(PAL.outline);
  gridTexture(scene, 'lift_sign', g);
}

export function buildVegasProps(scene: Phaser.Scene): void {
  slotMachine(scene, 'slot0', '#a01828', '#fee761');
  slotMachine(scene, 'slot1', '#5a2a8a', '#ff9ad8');
  car(scene, 'car0', '#ff7ab8', '#b8487e', '#ffb0d8');
  car(scene, 'car1', '#f4f0e8', '#a8a4b8', '#d8d4e0');
  car(scene, 'car2', '#fee761', '#c9a04a', '#fff3a8');
  car(scene, 'car3', '#3ff0ff', '#2a9ab0', '#a8f8ff');
  liftSign(scene);
}

/** Nombres de casinos inventados (para los carteles de neón). */
export const CASINO_NAMES = ['JAMÓN PALACE', 'EL GORDO', 'PATA NEGRA', 'IBÉRICO ROYALE', 'LUCKY CERDO', 'BELLOTA DE ORO', 'LA LONCHA', 'FLAMINGO', 'CASINO SERRANO'];
