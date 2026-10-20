import Phaser from 'phaser';
import { TILE } from '../config/balance';
import type { BiomeId } from '../world/maps';
import { PAL } from './palette';
import { gridTexture, PixelGrid } from './pixel';
import type { Biome, TileCtx } from './tiles';

/**
 * Mapas de ciudad: París, Barcelona y Ceuta.
 * Suelos, edificios y monumentos dibujados por código.
 */

export const CITY_IDS: BiomeId[] = ['paris', 'barcelona', 'ceuta'];

export const CITY_BIOMES: Record<'paris' | 'barcelona' | 'ceuta', Biome> = {
  paris: { base: '#a9a49b', dark: '#8f897f', light: '#bdb7ac', detail: '#7d776d', sparkle: ['#f4f0e8'], rockTop: '#b8b2a6', rockMid: '#9a948a', rockFace: '#6d675e', rockDark: '#4d4840' },
  barcelona: { base: '#bdb7ad', dark: '#a39d93', light: '#cfc9bf', detail: '#8d877d', sparkle: ['#f4f0e8'], rockTop: '#d9c29a', rockMid: '#bfa478', rockFace: '#9c8056', rockDark: '#6e5a3a' },
  ceuta: { base: '#efe6d2', dark: '#ddcfb0', light: '#f8f2e4', detail: '#c9b58a', sparkle: ['#f4f0e8'], rockTop: '#d4b47c', rockMid: '#c09d62', rockFace: '#97773f', rockDark: '#6b532b' },
};

const isCity = (id: BiomeId) => CITY_IDS.includes(id);
const at = (t: TileCtx, dx: number, dy: number) => t.grid.charAt(t.tx + dx, t.ty + dy);

// ------------------------------------------------------------------ suelos

function cityGround(t: TileCtx): void {
  const { r, ox, oy, tx, ty, id } = t;
  for (let y = 0; y < TILE; y++) {
    for (let x = 0; x < TILE; x++) {
      const gx = tx * TILE + x;
      const gy = ty * TILE + y;
      let c: string;
      if (id === 'paris') {
        // adoquines en hileras desplazadas
        const row = Math.floor(gy / 4);
        const off = (row % 2) * 3;
        const joint = gy % 4 === 3 || (gx + off) % 6 === 5;
        const stone = (Math.floor((gx + off) / 6) * 7 + row * 13) % 3;
        c = joint ? '#7d776d' : stone === 0 ? '#a9a49b' : stone === 1 ? '#9d978d' : '#b3ada3';
      } else if (id === 'barcelona') {
        // panot de flor de Barcelona (módulo de 8x8)
        const P = ['ff....ff', 'f..oo..f', '..o..o..', '.o.cc.o.', '.o.cc.o.', '..o..o..', 'f..oo..f', 'ff....ff'];
        const ch = P[gy % 8][gx % 8];
        c = ch === '.' ? '#bdb7ad' : ch === 'c' ? '#9a948a' : '#a8a298';
        if (gx % 8 === 0 || gy % 8 === 0) c = '#958f85';
      } else {
        // plaza ceutí: rombos claros y ocres
        const d = (Math.floor((gx + gy) / 4) + Math.floor((gx - gy + 400) / 4)) % 2;
        c = d ? '#efe6d2' : '#e2d0a6';
        if ((gx + gy) % 4 === 0 && (gx - gy) % 4 === 0) c = '#c9b58a';
      }
      r.set(ox + x, oy + y, c);
    }
  }
}

function grass(t: TileCtx): void {
  const { r, ox, oy, rand } = t;
  for (let y = 0; y < TILE; y++)
    for (let x = 0; x < TILE; x++) {
      const n = rand();
      r.set(ox + x, oy + y, n < 0.12 ? '#468c3f' : n < 0.2 ? '#5fae52' : '#4f9a45');
    }
  if (rand() < 0.15) {
    const x = ox + 3 + Math.floor(rand() * 10);
    const y = oy + 3 + Math.floor(rand() * 10);
    r.set(x, y, rand() < 0.5 ? '#fee761' : '#f4f0e8');
  }
  // borde de césped cuidado (Campo de Marte)
  if (t.id === 'paris') {
    if (at(t, 0, -1) !== ',' && at(t, 0, -1) !== 'L') for (let x = 0; x < TILE; x++) r.set(ox + x, oy, '#d9cfb8');
    if (at(t, 0, 1) !== ',' && at(t, 0, 1) !== 'L') for (let x = 0; x < TILE; x++) r.set(ox + x, oy + TILE - 1, '#d9cfb8');
  }
}

function sand(t: TileCtx): void {
  const { r, ox, oy, rand } = t;
  for (let y = 0; y < TILE; y++)
    for (let x = 0; x < TILE; x++) {
      const n = rand();
      r.set(ox + x, oy + y, n < 0.12 ? '#e2c88a' : n < 0.2 ? '#f8e9c0' : '#efd9a0');
    }
  if (rand() < 0.06) r.set(ox + 3 + Math.floor(rand() * 10), oy + 3 + Math.floor(rand() * 10), rand() < 0.5 ? '#f6a3b0' : '#ffffff');
  // espuma donde rompe la ola
  if (at(t, 0, 1) === '~') for (let x = 0; x < TILE; x++) if ((x + t.tx) % 3) r.set(ox + x, oy + TILE - 1, '#ffffff');
}

function ground(t: TileCtx): void {
  let c = at(t, 0, 0);
  // Árboles, rocas, arbustos y monumentos toman el suelo de alrededor (césped, arena o baldosa).
  if (c !== ',' && c !== 's' && c !== '.') {
    const n = [at(t, -1, 0), at(t, 1, 0), at(t, 0, -1), at(t, 0, 1)];
    const grassN = n.filter((x) => x === ',').length;
    const sandN = n.filter((x) => x === 's').length;
    c = grassN >= 2 || (grassN >= 1 && sandN === 0 && !n.includes('.')) ? ',' : sandN >= 2 ? 's' : '.';
  }
  if (c === ',') grass(t);
  else if (c === 's') sand(t);
  else cityGround(t);
}

// ------------------------------------------------------------------ edificios

function building(t: TileCtx, ch: string): void {
  const { r, ox, oy, rand, id } = t;
  const below = at(t, 0, 1) === ch;
  const above = at(t, 0, -1) === ch;
  const faceH = below ? 0 : 7;
  for (let y = 0; y < TILE; y++) {
    for (let x = 0; x < TILE; x++) {
      const gx = t.tx * TILE + x;
      const gy = t.ty * TILE + y;
      let c: string;
      const face = y >= TILE - faceH;
      if (ch === 'W') {
        // casas blancas de Ceuta
        if (face) {
          const fy = y - (TILE - faceH);
          c = fy === 0 ? '#d8d4ca' : '#f6f4ee';
          if ((gx % 8 === 2 || gx % 8 === 3) && fy >= 2 && fy <= 4) c = (gx >> 3) % 2 ? '#3f7fc0' : '#3f9a6a';
        } else c = rand() < 0.08 ? '#e6e2d8' : '#f6f4ee';
      } else if (id === 'paris') {
        if (face) {
          // fachada de piedra crema, ventanas y balcón de forja
          const fy = y - (TILE - faceH);
          c = '#eadfc6';
          if (gx % 4 === 1 && fy >= 1 && fy <= 4) c = '#3a4466';
          if (fy === 5) c = '#1f1a24';
          if (fy === 0) c = '#cfc2a4';
        } else {
          // tejado de zinc abuhardillado
          c = gx % 3 === 0 ? '#6b7a90' : '#7f8ea3';
          if (!above && y < 2) c = '#9aa7bf';
        }
      } else if (id === 'barcelona') {
        if (face) {
          const fy = y - (TILE - faceH);
          c = '#d9a66f';
          if (gx % 4 === 1 && fy >= 1 && fy <= 4) c = fy === 1 ? '#4f8a5a' : '#3a2f2a';
          if (fy === 5) c = '#8a5a3a';
          if (fy === 0) c = '#c08e58';
        } else {
          // azotea de baldosas
          c = gx % 4 === 0 || gy % 4 === 0 ? '#c49e74' : '#d8b48a';
          if (!above && y < 2) c = '#efd9b8';
        }
      } else {
        // Murallas Reales: sillares de piedra dorada
        const row = Math.floor(gy / 4);
        const mortar = gy % 4 === 3 || (gx + (row % 2) * 3) % 6 === 5;
        c = mortar ? '#9c7a4c' : face ? '#a8844f' : rand() < 0.12 ? '#d4b47c' : '#c9a46b';
        // almenas arriba
        if (!above && y < 3) c = Math.floor(gx / 3) % 2 ? '#e0c48c' : '#c9a46b';
      }
      r.set(ox + x, oy + y, c);
    }
  }
  // chimeneas de París y depósitos de agua en las azoteas
  if (id === 'paris' && ch === '#' && rand() < 0.35) {
    const x = ox + 3 + Math.floor(rand() * 9);
    const y = oy + 2 + Math.floor(rand() * 4);
    r.set(x, y, '#c9734a');
    r.set(x + 1, y, '#c9734a');
    r.set(x, y + 1, '#8a4a30');
    r.set(x + 1, y + 1, '#8a4a30');
  }
  if (id === 'barcelona' && ch === '#' && rand() < 0.2) {
    const x = ox + 4 + Math.floor(rand() * 7);
    r.set(x, oy + 4, '#7a8396');
    r.set(x + 1, oy + 4, '#7a8396');
    r.set(x, oy + 5, '#5a6378');
    r.set(x + 1, oy + 5, '#5a6378');
  }
}

// ------------------------------------------------------------------ mobiliario urbano

function cafe(t: TileCtx): void {
  cityGround(t);
  const { r, ox, oy } = t;
  const g = new PixelGrid(16, 16);
  g.ellipse(8, 8, 4.5, 3.5, '#f4f0e8');
  for (let y = 5; y <= 11; y++) for (let x = 4; x <= 12; x++) if (g.get(x, y) && (x + y) % 2 === 0) g.set(x, y, '#d8222c');
  g.rect(1, 6, 2, 4, '#7a4a2a');
  g.rect(13, 6, 2, 4, '#7a4a2a');
  g.rect(7, 12, 3, 2, '#7a4a2a');
  g.outline(PAL.outline);
  stamp(r, g, ox, oy);
}

function metro(t: TileCtx): void {
  cityGround(t);
  const { r, ox, oy } = t;
  // escaleras de bajada y barandilla verde de Guimard
  for (let y = 3; y < 15; y++) for (let x = 3; x < 13; x++) r.set(ox + x, oy + y, y % 2 ? '#2a2633' : '#3a3446');
  for (let x = 2; x < 14; x++) {
    r.set(ox + x, oy + 2, '#2f6b4f');
    r.set(ox + x, oy + 15, '#2f6b4f');
  }
  for (let y = 2; y < 16; y++) {
    r.set(ox + 2, oy + y, '#2f6b4f');
    r.set(ox + 13, oy + y, '#2f6b4f');
  }
  r.set(ox + 2, oy + 1, '#ffb347');
  r.set(ox + 13, oy + 1, '#ffb347');
}

function bench(t: TileCtx): void {
  cityGround(t);
  const { r, ox, oy, rand } = t;
  const g = new PixelGrid(16, 16);
  const cols = ['#e8c84a', '#3f8fd8', '#e85a4a', '#5ab86a', '#f4f0e8', '#2fb5b5', '#f08a3a'];
  for (let y = 3; y < 13; y++)
    for (let x = 1; x < 15; x++) {
      const wave = Math.sin((x + t.tx * 16) * 0.5) * 2;
      if (y < 5 + wave || y > 11 + wave * 0.5) continue;
      const grout = (x * 3 + y * 5) % 7 === 0;
      g.set(x, y, grout ? '#f4f0e8' : cols[Math.floor(rand() * cols.length)]);
    }
  g.outline('#5a4a3a');
  stamp(r, g, ox, oy);
}

function lane(t: TileCtx): void {
  cityGround(t);
  const { r, ox, oy } = t;
  const horiz = at(t, -1, 0) === 'k' || at(t, 1, 0) === 'k';
  for (let y = 2; y < 14; y++) for (let x = 2; x < 14; x++) r.set(ox + x, oy + y, '#3a9d63');
  for (let i = 2; i < 14; i++) {
    if (horiz) {
      if (i % 4 < 2) {
        r.set(ox + i, oy + 2, '#f4f0e8');
        r.set(ox + i, oy + 13, '#f4f0e8');
      }
    } else if (i % 4 < 2) {
      r.set(ox + 2, oy + i, '#f4f0e8');
      r.set(ox + 13, oy + i, '#f4f0e8');
    }
  }
  if (horiz) for (let x = 0; x < TILE; x++) for (const y of [0, 1, 14, 15]) r.set(ox + x, oy + y, '#3a9d63');
  else for (let y = 0; y < TILE; y++) for (const x of [0, 1, 14, 15]) r.set(ox + x, oy + y, '#3a9d63');
  // pictograma de bici cada pocos tiles
  if ((t.tx + t.ty) % 5 === 0) {
    const W = '#f4f0e8';
    [[5, 9], [6, 8], [6, 10], [7, 9], [9, 9], [10, 8], [10, 10], [11, 9], [7, 7], [8, 7], [9, 8], [8, 8]].forEach(([x, y]) => r.set(ox + x, oy + y, W));
  }
}

function stoneBridge(t: TileCtx): void {
  const { r, ox, oy } = t;
  const above = at(t, 0, -1) === '=';
  const below = at(t, 0, 1) === '=';
  for (let y = 0; y < TILE; y++)
    for (let x = 0; x < TILE; x++) {
      const gx = t.tx * TILE + x;
      r.set(ox + x, oy + y, (gx + y * 2) % 7 === 0 ? '#a39d93' : '#bdb7ad');
    }
  if (!above) for (let x = 0; x < TILE; x++) {
    r.set(ox + x, oy, '#6d675e');
    r.set(ox + x, oy + 1, x % 4 === 0 ? '#6d675e' : '#d9d4c8');
  }
  if (!below) for (let x = 0; x < TILE; x++) {
    r.set(ox + x, oy + TILE - 2, x % 4 === 0 ? '#6d675e' : '#d9d4c8');
    r.set(ox + x, oy + TILE - 1, '#6d675e');
  }
}

function landmarkBase(t: TileCtx): void {
  ground(t);
  const { r, ox, oy } = t;
  for (let y = 0; y < TILE; y++) for (let x = 0; x < TILE; x++) if ((x + y) % 2 === 0) r.set(ox + x, oy + y, '#7d776d');
}

function treeBase(t: TileCtx): void {
  ground(t);
  const { r, ox, oy } = t;
  for (let y = 10; y < 16; y++)
    for (let x = 3; x < 13; x++) {
      const dx = (x - 8) / 5;
      const dy = (y - 13) / 2.6;
      if (dx * dx + dy * dy <= 1) r.set(ox + x, oy + y, '#6d675e');
    }
}

/** La roca de tiles.ts dibuja su propio suelo: la pintamos aparte y solo copiamos la piedra. */
function rockOver(t: TileCtx, rock: (t: TileCtx) => void): void {
  const { ox, oy } = t;
  const img = t.r.img;
  const saved = img.data.slice();
  rock(t);
  // vuelve a poner el suelo donde la roca dibujó su suelo propio (fuera de la elipse de la piedra)
  for (let y = 0; y < TILE; y++)
    for (let x = 0; x < TILE; x++) {
      const dx = (x + 0.5 - 8) / 7.5;
      const dy = (y + 0.5 - 9) / 6.5;
      if (dx * dx + dy * dy > 1) {
        const i = ((oy + y) * img.width + ox + x) * 4;
        img.data[i] = saved[i];
        img.data[i + 1] = saved[i + 1];
        img.data[i + 2] = saved[i + 2];
        img.data[i + 3] = saved[i + 3];
      }
    }
}

function stamp(r: TileCtx['r'], g: PixelGrid, ox: number, oy: number): void {
  for (let y = 0; y < g.h; y++)
    for (let x = 0; x < g.w; x++) {
      const c = g.get(x, y);
      if (c) r.set(ox + x, oy + y, c);
    }
}

/** Dibuja un tile de ciudad. Devuelve false si no es una ciudad (lo dibuja tiles.ts). */
export function drawCityTile(t: TileCtx, water: (t: TileCtx) => void, rock: (t: TileCtx) => void): boolean {
  if (!isCity(t.id)) return false;
  const c = at(t, 0, 0);
  switch (c) {
    case '#':
    case 'W':
      building(t, c);
      break;
    case '~':
      water(t);
      break;
    case '=':
      stoneBridge(t);
      break;
    case 'c':
      cafe(t);
      break;
    case 'M':
      metro(t);
      break;
    case 'g':
      bench(t);
      break;
    case 'k':
      lane(t);
      break;
    case 'r':
      ground(t);
      rockOver(t, rock);
      break;
    case 'T':
      treeBase(t);
      break;
    case 'L':
    case 'P':
    case 'S':
    case 'C':
      landmarkBase(t);
      break;
    default:
      ground(t);
  }
  return true;
}

// ------------------------------------------------------------------ props y monumentos

function buildPalm(scene: Phaser.Scene, key: string, lean: number): void {
  const g = new PixelGrid(26, 34);
  for (let y = 12; y < 33; y++) {
    const x = Math.round(12 + lean * ((33 - y) / 21) * 3);
    g.set(x, y, y % 3 === 0 ? '#7a4f2a' : '#9a6a3c');
    g.set(x + 1, y, '#7a4f2a');
  }
  const cx = Math.round(12 + lean * 3);
  const leaf = (dx: number, dy: number) => {
    for (let i = 1; i <= 9; i++) {
      const x = Math.round(cx + dx * i);
      const y = Math.round(11 + dy * i + (i * i) / 14);
      g.set(x, y, i % 3 === 0 ? '#265c42' : '#3e8948');
      g.set(x, y - 1, '#63c74d');
    }
  };
  leaf(1, -0.3);
  leaf(-1, -0.3);
  leaf(0.8, 0.2);
  leaf(-0.8, 0.2);
  leaf(0.35, -0.8);
  leaf(-0.35, -0.8);
  g.set(cx, 12, '#c9734a');
  g.set(cx + 1, 12, '#c9734a');
  g.outline(PAL.outline);
  gridTexture(scene, key, g);
}

function buildMetroSign(scene: Phaser.Scene): void {
  const g = new PixelGrid(9, 18);
  g.rect(4, 7, 1, 11, '#2f6b4f');
  g.ellipse(4.5, 4.5, 4, 4, '#f2c230');
  [[2, 2], [2, 3], [2, 4], [2, 5], [2, 6], [3, 3], [4, 4], [5, 3], [6, 2], [6, 3], [6, 4], [6, 5], [6, 6]].forEach(([x, y]) => g.set(x, y, '#1f1a24'));
  g.outline(PAL.outline);
  gridTexture(scene, 'metro_sign', g);
}

export function buildCityProps(scene: Phaser.Scene): void {
  buildPalm(scene, 'palm0', 1);
  buildPalm(scene, 'palm1', -1);
  buildMetroSign(scene);
}

/** Torre Eiffel: celosía de hierro marrón con dos plataformas. */
function eiffel(w: number): PixelGrid {
  const H = 130;
  const g = new PixelGrid(w + 2, H);
  const cx = (w + 2) / 2;
  const iron = '#6e4f36';
  const ironL = '#9a7652';
  for (let y = 4; y < H - 1; y++) {
    const t = (H - 1 - y) / (H - 5); // 0 abajo, 1 arriba
    const hw = 2 + (w / 2 - 3) * Math.pow(1 - t, 2.2);
    for (let x = Math.floor(cx - hw); x <= Math.ceil(cx + hw); x++) {
      const edge = x <= cx - hw + 1.5 || x >= cx + hw - 1.5;
      const lattice = (x + y) % 4 === 0 || (x - y + 400) % 4 === 0;
      // arco entre las patas
      const arch = y > H - 26 && Math.abs(x - cx) < hw - 7 && ((x - cx) / (hw - 7)) ** 2 + ((y - (H - 1)) / 24) ** 2 < 1;
      if (arch) continue;
      if (edge || lattice) g.set(x, y, edge ? iron : (x + y) % 8 === 0 ? ironL : iron);
    }
  }
  // plataformas
  for (const [py, ext] of [[H - 34, 4], [H - 72, 2], [26, 1]] as [number, number][]) {
    const t = (H - 1 - py) / (H - 5);
    const hw = 2 + (w / 2 - 3) * Math.pow(1 - t, 2.2) + ext;
    for (let x = Math.floor(cx - hw); x <= Math.ceil(cx + hw); x++) {
      g.set(x, py, ironL);
      g.set(x, py + 1, iron);
    }
  }
  g.rect(Math.floor(cx) - 1, 0, 2, 5, iron);
  g.set(Math.floor(cx) - 1, 0, '#e43b44');
  g.outline('#2a1e14');
  return g;
}

/** Pirámide del Louvre: cristal con rejilla. */
function pyramid(w: number, hTiles: number): PixelGrid {
  const H = hTiles * TILE + 10;
  const g = new PixelGrid(w + 2, H);
  const cx = (w + 2) / 2;
  for (let y = 2; y < H - 1; y++) {
    const hw = ((y - 2) / (H - 3)) * (w / 2 - 1);
    for (let x = Math.floor(cx - hw); x <= Math.ceil(cx + hw); x++) {
      const right = x > cx;
      const grid = (x + y) % 4 === 0 || (x - y + 400) % 4 === 0;
      g.set(x, y, grid ? '#5f7f99' : right ? '#7fa5bb' : '#a9cfe0');
    }
  }
  g.outline('#3a4466');
  return g;
}

/** Sagrada Família: fachada y torres con remates de trencadís, y una grúa (siempre en obras). */
function sagrada(w: number, hTiles: number): PixelGrid {
  // Cabe dentro del mapa aunque esté pegada al borde de arriba.
  const H = hTiles * TILE + 46;
  const g = new PixelGrid(w + 2, H);
  const stone = '#cdb98f';
  const dark = '#a89268';
  const bodyTop = H - 34;
  for (let y = bodyTop; y < H - 1; y++) for (let x = 2; x < w; x++) g.set(x, y, (x * 3 + y) % 7 === 0 ? dark : stone);
  for (const px of [w * 0.25, w * 0.5, w * 0.75]) {
    for (let y = H - 20; y < H - 1; y++)
      for (let x = Math.round(px) - 4; x <= Math.round(px) + 4; x++) {
        if (((x - px) / 4.5) ** 2 + ((y - (H - 4)) / 15) ** 2 < 1) g.set(x, y, '#5a4a3a');
      }
  }
  const base = H - 26;
  const towers = [
    { x: w * 0.12, h: 50 },
    { x: w * 0.28, h: 66 },
    { x: w * 0.42, h: 76 },
    { x: w * 0.5, h: 84 },
    { x: w * 0.58, h: 76 },
    { x: w * 0.72, h: 66 },
    { x: w * 0.88, h: 50 },
  ];
  const cols = ['#e8c84a', '#e85a4a', '#f4f0e8', '#3f8fd8'];
  for (const tw of towers) {
    const top = Math.max(9, base - tw.h);
    for (let y = top; y <= base; y++) {
      const t = (y - top) / (base - top);
      const hw = 1 + t * 5;
      for (let x = Math.floor(tw.x - hw); x <= Math.ceil(tw.x + hw); x++)
        g.set(x, y, y % 5 === 0 && Math.abs(x - tw.x) < hw - 1 ? '#5a4a3a' : x > tw.x ? dark : stone);
    }
    for (let i = 0; i < 6; i++) g.set(Math.round(tw.x) + (i % 2 ? 1 : 0), top - 1 - i, cols[i % cols.length]);
    g.set(Math.round(tw.x), top - 7, '#e8c84a');
  }
  const gx = w - 6;
  for (let y = 10; y < bodyTop; y++) g.set(gx, y, y % 2 ? '#f2c230' : '#c79a1c');
  for (let x = gx - 26; x <= gx + 3; x++) g.set(x, 10, x % 2 ? '#f2c230' : '#c79a1c');
  g.rect(gx - 24, 11, 1, 8, '#3a3446');
  g.outline('#3a2f24');
  return g;
}

/** Hércules de Ceuta separando las columnas. */
function hercules(w: number, hTiles: number): PixelGrid {
  const H = hTiles * TILE + 30;
  const g = new PixelGrid(w + 10, H);
  const W2 = w + 10;
  // pedestal
  g.rect(2, H - 8, W2 - 4, 7, '#7a8396');
  g.rect(2, H - 8, W2 - 4, 1, '#9aa7bf');
  // columnas
  for (const cx of [4, W2 - 9]) {
    g.rect(cx, 8, 6, H - 16, '#e6e0d2');
    for (let y = 8; y < H - 8; y++) g.set(cx + 2, y, '#c9c2b2');
    g.rect(cx - 1, 6, 8, 3, '#f4f0e8');
  }
  // figura de bronce empujando
  const bronze = '#7a5a34';
  const mx = Math.round(W2 / 2);
  g.ellipse(mx, H - 34, 4, 4, bronze);
  g.rect(mx - 4, H - 30, 8, 12, bronze);
  g.rect(mx - 4, H - 18, 3, 10, bronze);
  g.rect(mx + 1, H - 18, 3, 10, bronze);
  for (let x = 10; x < W2 - 9; x++) g.set(x, H - 28, bronze);
  for (let x = 10; x < W2 - 9; x++) g.set(x, H - 27, '#5c4226');
  g.set(mx - 1, H - 35, '#a8844f');
  g.outline('#2a1e14');
  return g;
}

/** Textura de un monumento según su letra y el tamaño de su huella en tiles. */
export function buildLandmark(scene: Phaser.Scene, key: string, ch: string, wTiles: number, hTiles: number): void {
  if (scene.textures.exists(key)) return;
  const w = wTiles * TILE;
  const g = ch === 'L' ? eiffel(w) : ch === 'P' ? pyramid(w, hTiles) : ch === 'S' ? sagrada(w, hTiles) : hercules(w, hTiles);
  gridTexture(scene, key, g);
}
