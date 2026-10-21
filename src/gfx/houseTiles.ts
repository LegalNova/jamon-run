import Phaser from 'phaser';
import { TILE } from '../config/balance';
import { PAL } from './palette';
import { gridTexture, PixelGrid } from './pixel';
import type { TileCtx } from './tiles';

/**
 * LA CASA (Escondite): vista cenital de una casa por dentro.
 * Paredes con papel pintado, parqué, baldosas, garaje, sótano y desván.
 */

const at = (t: TileCtx, dx: number, dy: number) => t.grid.charAt(t.tx + dx, t.ty + dy);
const FLOORS = 'fupvay';
const WALLISH = '#';

/** Suelo de un tile que no es suelo (puerta, interruptor, mueble): el de alrededor. */
function floorOf(t: TileCtx): string {
  const c = at(t, 0, 0);
  if (FLOORS.includes(c)) return c;
  const n = [at(t, 0, 1), at(t, 0, -1), at(t, -1, 0), at(t, 1, 0), at(t, -1, -1), at(t, 1, 1), at(t, 1, -1), at(t, -1, 1)];
  for (const x of n) if (FLOORS.includes(x)) return x;
  return 'f';
}

function wood(t: TileCtx, cols: string[], joint: string): void {
  const { r, ox, oy, rand } = t;
  for (let y = 0; y < TILE; y++)
    for (let x = 0; x < TILE; x++) {
      const gx = t.tx * TILE + x;
      const gy = t.ty * TILE + y;
      const row = Math.floor(gy / 4);
      const off = (row * 7) % 12;
      let c = cols[(Math.floor((gx + off) / 12) + row) % cols.length];
      if (gy % 4 === 3 || (gx + off) % 12 === 0) c = joint;
      else if (rand() < 0.03) c = joint;
      r.set(ox + x, oy + y, c);
    }
}

function tiles(t: TileCtx, a: string, b: string, grout: string): void {
  const { r, ox, oy } = t;
  for (let y = 0; y < TILE; y++)
    for (let x = 0; x < TILE; x++) {
      const gx = t.tx * TILE + x;
      const gy = t.ty * TILE + y;
      let c = (Math.floor(gx / 8) + Math.floor(gy / 8)) % 2 ? a : b;
      if (gx % 8 === 0 || gy % 8 === 0) c = grout;
      r.set(ox + x, oy + y, c);
    }
}

function concrete(t: TileCtx, base: string, dark: string, light: string): void {
  const { r, ox, oy, rand } = t;
  for (let y = 0; y < TILE; y++)
    for (let x = 0; x < TILE; x++) {
      const n = rand();
      r.set(ox + x, oy + y, n < 0.08 ? dark : n < 0.13 ? light : base);
    }
}

function stairs(t: TileCtx): void {
  const { r, ox, oy } = t;
  for (let y = 0; y < TILE; y++)
    for (let x = 0; x < TILE; x++) {
      const gy = t.ty * TILE + y;
      const step = gy % 4;
      r.set(ox + x, oy + y, step === 0 ? '#e0b880' : step === 3 ? '#6a4228' : '#a87448');
    }
}

function floor(t: TileCtx): void {
  switch (floorOf(t)) {
    case 'u':
      return tiles(t, '#e8e6f0', '#b8d4e8', '#8a94a8');
    case 'p':
      return concrete(t, '#8a8a92', '#76767e', '#9a9aa2');
    case 'v':
      return tiles(t, '#5e586a', '#544e60', '#3e3a48');
    case 'a':
      return wood(t, ['#7a5a3e', '#6e5036', '#84623f'], '#4a3424');
    case 'y':
      return stairs(t);
    default:
      return wood(t, ['#b07a4a', '#a06c40', '#bd8754'], '#7a4a2a');
  }
}

/** Pared vista desde arriba: el remate oscuro arriba y el papel pintado en la cara de abajo. */
function wall(t: TileCtx): void {
  const { r, ox, oy } = t;
  const isW = (dx: number, dy: number) => WALLISH.includes(at(t, dx, dy)) || !t.grid.inBounds(t.tx + dx, t.ty + dy);
  const faceH = isW(0, 1) ? 0 : 9;
  // papel pintado según la habitación de abajo
  const below = at(t, 0, 1);
  const paper = below === 'u' ? ['#cfe4ee', '#b8d4e2'] : below === 'p' || below === 'v' ? ['#9a98a8', '#8a8898'] : below === 'a' ? ['#a08060', '#907050'] : ['#f0d8a8', '#e4c890'];
  for (let y = 0; y < TILE; y++)
    for (let x = 0; x < TILE; x++) {
      const gx = t.tx * TILE + x;
      let c: string;
      if (y >= TILE - faceH) {
        const fy = y - (TILE - faceH);
        c = paper[Math.floor(gx / 3) % 2];
        if (fy === 0) c = '#3a2a3a';
        if (fy >= faceH - 2) c = fy === faceH - 1 ? '#4a2a1a' : '#7a4a2a';
      } else {
        c = '#4a3a4a';
        if (!isW(0, -1) && y === 0) c = '#6a5a6a';
        if (!isW(-1, 0) && x === 0) c = '#6a5a6a';
        if (!isW(1, 0) && x === TILE - 1) c = '#2e222e';
      }
      r.set(ox + x, oy + y, c);
    }
  // cuadros colgados en algunas paredes
  if (faceH && (t.tx * 5 + t.ty * 3) % 7 === 0) {
    const fy = oy + TILE - faceH + 2;
    for (let j = 0; j < 4; j++) for (let i = 0; i < 6; i++) r.set(ox + 5 + i, fy + j, i === 0 || i === 5 || j === 0 || j === 3 ? '#c9a04a' : (t.tx % 2 ? '#63c74d' : '#5ab8e8'));
  }
}

/** Dónde va la placa de un interruptor (pegada a la pared más cercana), en px dentro del tile. */
export function switchSpot(grid: TileCtx['grid'], tx: number, ty: number): { x: number; y: number } {
  const w = (dx: number, dy: number) => grid.charAt(tx + dx, ty + dy) === '#';
  if (w(0, 1)) return { x: 8, y: 13 };
  if (w(0, -1)) return { x: 8, y: 3 };
  if (w(-1, 0)) return { x: 3, y: 8 };
  if (w(1, 0)) return { x: 13, y: 8 };
  return { x: 8, y: 8 };
}

function lightSwitch(t: TileCtx): void {
  floor(t);
  const { r, ox, oy } = t;
  const s = switchSpot(t.grid, t.tx, t.ty);
  for (let y = -3; y <= 3; y++) for (let x = -2; x <= 2; x++) r.set(ox + s.x + x, oy + s.y + y, Math.abs(x) === 2 || Math.abs(y) === 3 ? '#8a8494' : '#f4f0e8');
}

function table(t: TileCtx): void {
  floor(t);
  const { r, ox, oy } = t;
  const isT = (dx: number, dy: number) => at(t, dx, dy) === 'c';
  const x0 = isT(-1, 0) ? 0 : 2;
  const x1 = isT(1, 0) ? 16 : 14;
  const y0 = isT(0, -1) ? 0 : 2;
  const y1 = isT(0, 1) ? 16 : 12;
  for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) r.set(ox + x, oy + y, (x + y) % 5 === 0 ? '#8a5a3a' : '#9a6a44');
  if (!isT(0, 1)) for (let x = x0; x < x1; x++) for (let y = 12; y < 15; y++) r.set(ox + x, oy + y, y === 14 ? '#3a2418' : '#6a4228');
  // mantel de cuadros en el centro
  if (!isT(0, -1) && !isT(-1, 0)) for (let y = 4; y < 9; y++) for (let x = 5; x < 11; x++) r.set(ox + x + (isT(1, 0) ? 6 : 0), oy + y + (isT(0, 1) ? 6 : 0), (x + y) % 2 ? '#d8222c' : '#f4f0e8');
}

function counter(t: TileCtx): void {
  floor(t);
  const { r, ox, oy } = t;
  for (let y = 0; y < 14; y++)
    for (let x = 0; x < TILE; x++) {
      let c = y < 9 ? '#c2c3c7' : '#f4f0e8';
      if (y === 0 || y === 8) c = '#8b9bb4';
      if (y >= 9 && x % 8 === 4) c = '#8a8494';
      if (y === 13) c = '#3a3848';
      r.set(ox + x, oy + y, c);
    }
  // fregadero o fogones
  if (t.tx % 2) for (let y = 2; y < 7; y++) for (let x = 4; x < 12; x++) r.set(ox + x, oy + y, y === 2 || x === 4 ? '#5a6378' : '#9ab0c8');
  else for (const [cx, cy] of [[5, 3], [10, 3], [5, 6], [10, 6]]) for (let j = -1; j <= 1; j++) for (let i = -1; i <= 1; i++) r.set(ox + cx + i, oy + cy + j, i || j ? '#262033' : '#d8222c');
}

/** Dibuja un tile de la casa. Devuelve false si el mapa no es la casa. */
export function drawHouseTile(t: TileCtx): boolean {
  if (t.id !== 'casa') return false;
  switch (at(t, 0, 0)) {
    case '#':
      wall(t);
      break;
    case 'J':
      lightSwitch(t);
      break;
    case 'c':
      table(t);
      break;
    case 'K':
      counter(t);
      break;
    case 'D': {
      floor(t);
      // umbral de la puerta
      const { r, ox, oy } = t;
      const horiz = at(t, -1, 0) === '#' || at(t, 1, 0) === '#' || at(t, -1, 0) === 'D' || at(t, 1, 0) === 'D';
      for (let i = 0; i < TILE; i++)
        for (let k = 6; k < 10; k++) {
          if (horiz) r.set(ox + i, oy + k, '#6a4228');
          else r.set(ox + k, oy + i, '#6a4228');
        }
      break;
    }
    case 'V':
      floor(t);
      for (let y = 4; y < 16; y++) for (let x = 0; x < TILE; x++) t.r.set(t.ox + x, t.oy + y, '#6e6e76');
      break;
    default:
      floor(t);
  }
  return true;
}

// ------------------------------------------------------------------ puertas

/** ¿La puerta está en una pared horizontal (se cruza de arriba abajo)? */
export function doorHorizontal(grid: TileCtx['grid'], tx: number, ty: number): boolean {
  const c = (dx: number, dy: number) => grid.charAt(tx + dx, ty + dy);
  return c(-1, 0) === '#' || c(1, 0) === '#' || (c(-1, 0) === 'D' && c(0, -1) !== '#') || (c(1, 0) === 'D' && c(0, -1) !== '#');
}

export function buildHouseProps(scene: Phaser.Scene): void {
  // Hoja de puerta cerrada en una pared horizontal (con su cara de madera) y en una vertical.
  {
    const g = new PixelGrid(16, 16);
    g.rect(0, 0, 16, 7, '#7a4a2a');
    g.rect(0, 7, 16, 9, '#a8683a');
    g.rect(2, 9, 5, 5, '#8a5430');
    g.rect(9, 9, 5, 5, '#8a5430');
    g.rect(13, 11, 2, 2, '#fee761');
    g.rect(0, 15, 16, 1, '#3a2418');
    gridTexture(scene, 'door_h', g);
  }
  {
    const g = new PixelGrid(16, 16);
    g.rect(5, 0, 6, 16, '#a8683a');
    g.rect(5, 0, 1, 16, '#7a4a2a');
    g.rect(10, 0, 1, 16, '#6a3a20');
    g.rect(6, 7, 2, 2, '#fee761');
    gridTexture(scene, 'door_v', g);
  }
  // Puerta abierta: la hoja girada, fina, pegada al marco.
  {
    const g = new PixelGrid(16, 16);
    g.rect(0, 0, 3, 14, '#a8683a');
    g.rect(0, 0, 1, 14, '#6a3a20');
    g.outline(PAL.outline);
    gridTexture(scene, 'door_h_open', g);
  }
  {
    const g = new PixelGrid(16, 16);
    g.rect(1, 0, 14, 3, '#a8683a');
    g.rect(1, 2, 14, 1, '#6a3a20');
    g.outline(PAL.outline);
    gridTexture(scene, 'door_v_open', g);
  }
}

