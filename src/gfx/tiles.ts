import Phaser from 'phaser';
import { TILE } from '../config/balance';
import { BiomeId } from '../world/maps';
import { Grid } from '../world/grid';
import { PAL } from './palette';
import { gridTexture, makeCanvas, PixelGrid, rng } from './pixel';
import { buildCityProps, CITY_BIOMES, drawCityTile } from './cityTiles';

// ------------------------------------------------------------------ utilidades de color

const rgbCache = new Map<string, [number, number, number]>();
function rgb(hex: string): [number, number, number] {
  let c = rgbCache.get(hex);
  if (!c) {
    const n = parseInt(hex.slice(1), 16);
    c = [(n >> 16) & 255, (n >> 8) & 255, n & 255];
    rgbCache.set(hex, c);
  }
  return c;
}

export class Raster {
  constructor(readonly img: ImageData) {}
  set(x: number, y: number, hex: string): void {
    if (x < 0 || y < 0 || x >= this.img.width || y >= this.img.height) return;
    const [r, g, b] = rgb(hex);
    const i = (y * this.img.width + x) * 4;
    const d = this.img.data;
    d[i] = r;
    d[i + 1] = g;
    d[i + 2] = b;
    d[i + 3] = 255;
  }
}

export interface Biome {
  base: string;
  dark: string;
  light: string;
  detail: string;
  sparkle: string[];
  rockTop: string;
  rockMid: string;
  rockFace: string;
  rockDark: string;
}

const BIOMES: Record<BiomeId, Biome> = {
  forest: {
    base: '#4f9a45',
    dark: '#468c3f',
    light: '#5fae52',
    detail: '#3a7a36',
    sparkle: ['#fee761', '#ffffff', '#f6a3b0', '#9be7ff'],
    rockTop: '#9aa7bf',
    rockMid: '#7b89a6',
    rockFace: '#56627f',
    rockDark: '#3a4466',
  },
  desert: {
    base: '#e6bf72',
    dark: '#d9ad62',
    light: '#f1d293',
    detail: '#c49a5a',
    sparkle: ['#b88a56', '#f4f0e8', '#a0703f'],
    rockTop: '#d7a670',
    rockMid: '#bb8a5a',
    rockFace: '#8f6243',
    rockDark: '#6b4530',
  },
  snow: {
    base: '#eaf1fb',
    dark: '#d9e3f2',
    light: '#ffffff',
    detail: '#c5d3ea',
    sparkle: ['#ffffff', '#b8d8ff', '#8b9bb4'],
    rockTop: '#f7faff',
    rockMid: '#c9d6ec',
    rockFace: '#6f7f9e',
    rockDark: '#4a5776',
  },
  ...CITY_BIOMES,
};

// ------------------------------------------------------------------ dibujo de tiles

export type TileCtx = {
  r: Raster;
  grid: Grid;
  biome: Biome;
  id: BiomeId;
  tx: number;
  ty: number;
  ox: number;
  oy: number;
  rand: () => number;
  phase: number;
};

export const isCh = (grid: Grid, tx: number, ty: number, chars: string): boolean => chars.includes(grid.charAt(tx, ty));

export function drawGround(t: TileCtx): void {
  const { r, biome, ox, oy, rand } = t;
  for (let y = 0; y < TILE; y++) {
    for (let x = 0; x < TILE; x++) {
      const n = rand();
      r.set(ox + x, oy + y, n < 0.1 ? biome.dark : n < 0.16 ? biome.light : biome.base);
    }
  }
  // matitas / piedrecitas
  const tufts = rand() < 0.5 ? 1 + Math.floor(rand() * 2) : 0;
  for (let k = 0; k < tufts; k++) {
    const x = ox + 2 + Math.floor(rand() * 11);
    const y = oy + 3 + Math.floor(rand() * 11);
    if (t.id === 'forest') {
      r.set(x, y, biome.detail);
      r.set(x + 2, y, biome.detail);
      r.set(x + 1, y + 1, biome.detail);
    } else if (t.id === 'desert') {
      r.set(x, y, biome.detail);
      r.set(x + 1, y, biome.dark);
    } else {
      r.set(x, y, biome.detail);
      r.set(x + 1, y + 1, biome.detail);
    }
  }
  if (rand() < 0.1) {
    const x = ox + 3 + Math.floor(rand() * 10);
    const y = oy + 3 + Math.floor(rand() * 10);
    const c = biome.sparkle[Math.floor(rand() * biome.sparkle.length)];
    r.set(x, y, c);
    if (t.id === 'forest') {
      r.set(x - 1, y, c);
      r.set(x + 1, y, c);
      r.set(x, y - 1, c);
      r.set(x, y + 1, c);
      r.set(x, y, PAL.yellow);
    }
  }
  if (t.id === 'desert' && rand() < 0.025) {
    // huesecito
    const x = ox + 4;
    const y = oy + 7;
    for (let i = 0; i < 7; i++) r.set(x + i, y, PAL.offWhite);
    r.set(x - 1, y - 1, PAL.offWhite);
    r.set(x - 1, y + 1, PAL.offWhite);
    r.set(x + 7, y - 1, PAL.offWhite);
    r.set(x + 7, y + 1, PAL.offWhite);
  }
}

function drawRockWall(t: TileCtx): void {
  const { r, biome, ox, oy, rand, grid, tx, ty } = t;
  const below = isCh(grid, tx, ty + 1, '#');
  const above = isCh(grid, tx, ty - 1, '#');
  const left = isCh(grid, tx - 1, ty, '#');
  const right = isCh(grid, tx + 1, ty, '#');
  const faceH = below ? 0 : 6;
  for (let y = 0; y < TILE; y++) {
    for (let x = 0; x < TILE; x++) {
      let c: string;
      if (y >= TILE - faceH) {
        c = (x + (ty % 2) * 3) % 7 === 0 ? biome.rockDark : biome.rockFace;
        if (t.id === 'desert' && (y - (TILE - faceH)) % 3 === 0) c = biome.rockDark;
        if (y === TILE - 1) c = biome.rockDark;
      } else {
        const n = rand();
        c = n < 0.18 ? biome.rockMid : biome.rockTop;
        if (!above && y === 0) c = t.id === 'snow' ? PAL.white : biome.rockTop;
        if (!left && x === 0) c = biome.rockMid;
        if (!right && x === TILE - 1) c = biome.rockMid;
      }
      r.set(ox + x, oy + y, c);
    }
  }
  // grietas y musgo
  if (faceH === 0 || rand() < 0.7) {
    const cx = ox + 3 + Math.floor(rand() * 9);
    const cy = oy + 3 + Math.floor(rand() * 5);
    r.set(cx, cy, biome.rockFace);
    r.set(cx + 1, cy + 1, biome.rockFace);
    r.set(cx + 1, cy + 2, biome.rockFace);
  }
  if (t.id === 'forest' && rand() < 0.5) {
    const mx = ox + Math.floor(rand() * 12);
    const my = oy + Math.floor(rand() * 6);
    for (let i = 0; i < 4; i++) r.set(mx + (i % 2), my + (i >> 1), i === 0 ? '#63c74d' : '#3e8948');
  }
  if (t.id === 'snow' && !below) {
    // carámbanos
    for (let x = 1; x < TILE; x += 3 + Math.floor(rand() * 2)) {
      const len = 1 + Math.floor(rand() * 3);
      for (let i = 0; i < len; i++) r.set(ox + x, oy + TILE - faceH + i, '#d8f4ff');
    }
  }
}

function drawRuin(t: TileCtx): void {
  const { r, ox, oy, rand, grid, tx, ty } = t;
  const below = isCh(grid, tx, ty + 1, 'R');
  const above = isCh(grid, tx, ty - 1, 'R');
  const faceH = below ? 0 : 6;
  for (let y = 0; y < TILE; y++) {
    for (let x = 0; x < TILE; x++) {
      const row = Math.floor(y / 4);
      const off = row % 2 === 0 ? 0 : 4;
      const mortar = y % 4 === 3 || (x + off) % 8 === 7;
      let c = mortar ? '#9c7552' : rand() < 0.15 ? '#d5b289' : '#c9a27a';
      if (y >= TILE - faceH) c = mortar ? '#6e4a33' : '#a07a55';
      if (!above && y < 2) c = y === 0 ? '#e9cfa6' : '#dcb98e';
      r.set(ox + x, oy + y, c);
    }
  }
  if (!above) {
    // borde desmoronado
    for (let x = 0; x < TILE; x++) if (rand() < 0.25) r.set(ox + x, oy, BIOMES.desert.base);
  }
}

export function drawSmallRock(t: TileCtx): void {
  drawGround(t);
  const { r, ox, oy, id } = t;
  const g = new PixelGrid(16, 16);
  const base = id === 'desert' ? '#a07a55' : '#8b9bb4';
  const light = id === 'desert' ? '#c9a27a' : '#c2c3c7';
  const dark = id === 'desert' ? '#6e4a33' : '#5a6988';
  g.ellipse(8, 9, 6.5, 5.5, base);
  g.ellipse(6.5, 7.5, 3.5, 2.5, light);
  for (let x = 3; x <= 13; x++) g.set(x, 13, dark);
  g.set(11, 11, dark);
  g.set(12, 12, dark);
  if (id === 'snow') {
    g.ellipse(8, 5.5, 5, 2, '#ffffff');
  }
  g.outline(PAL.outline);
  for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) {
    const c = g.get(x, y);
    if (c) r.set(ox + x, oy + y, c);
  }
}

function drawSnowPile(t: TileCtx): void {
  drawGround(t);
  const { r, ox, oy } = t;
  const g = new PixelGrid(16, 16);
  g.ellipse(8, 9, 7.5, 6.5, '#c5d3ea');
  g.ellipse(8, 8, 7, 5.5, '#e2eaf7');
  g.ellipse(7, 6.5, 5, 3.5, '#ffffff');
  g.set(5, 5, '#b8d8ff');
  g.outline('#7d8fb3');
  for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) {
    const c = g.get(x, y);
    if (c) r.set(ox + x, oy + y, c);
  }
}

export function drawWater(t: TileCtx): void {
  const { r, ox, oy, grid, tx, ty, phase } = t;
  const wet = (x: number, y: number) => isCh(grid, x, y, '~=');
  for (let y = 0; y < TILE; y++) {
    for (let x = 0; x < TILE; x++) {
      const gx = tx * TILE + x;
      const gy = ty * TILE + y;
      const wave = Math.sin(gx * 0.35 + gy * 0.15 + phase * 1.6) + Math.sin(gy * 0.6 - phase * 2.1);
      let c = '#2f7fd1';
      if (wave > 1.45) c = '#8fd3ff';
      else if (wave > 1.0) c = '#4f9ee6';
      else if (wave < -1.3) c = '#2768b5';
      r.set(ox + x, oy + y, c);
    }
  }
  if (!wet(tx, ty - 1)) {
    for (let x = 0; x < TILE; x++) {
      r.set(ox + x, oy, '#d8f4ff');
      r.set(ox + x, oy + 1, '#1f5aa0');
      r.set(ox + x, oy + 2, '#1f5aa0');
    }
  }
  if (!wet(tx - 1, ty)) for (let y = 0; y < TILE; y++) {
    r.set(ox, oy + y, ((y + Math.floor(phase * 3)) % 4 === 0) ? '#ffffff' : '#bfe9ff');
    r.set(ox + 1, oy + y, '#2768b5');
  }
  if (!wet(tx + 1, ty)) for (let y = 0; y < TILE; y++) {
    r.set(ox + TILE - 1, oy + y, ((y + Math.floor(phase * 3)) % 4 === 2) ? '#ffffff' : '#bfe9ff');
    r.set(ox + TILE - 2, oy + y, '#2768b5');
  }
  if (!wet(tx, ty + 1)) for (let x = 0; x < TILE; x++) r.set(ox + x, oy + TILE - 1, '#bfe9ff');
}

export function drawBridge(t: TileCtx): void {
  const { r, ox, oy, grid, tx, ty } = t;
  const above = isCh(grid, tx, ty - 1, '=');
  const below = isCh(grid, tx, ty + 1, '=');
  for (let y = 0; y < TILE; y++) {
    for (let x = 0; x < TILE; x++) {
      const plank = Math.floor((tx * TILE + x) / 4);
      let c = plank % 2 === 0 ? '#b86f50' : '#a8603f';
      if (x % 4 === 3) c = '#5c3a2a';
      if ((y === 5 || y === 11) && x % 4 === 1) c = '#3a2418';
      r.set(ox + x, oy + y, c);
    }
  }
  if (!above) for (let x = 0; x < TILE; x++) {
    r.set(ox + x, oy, '#3a2418');
    r.set(ox + x, oy + 1, x % 5 === 0 ? '#3a2418' : '#8a4f38');
    r.set(ox + x, oy + 2, '#5c3a2a');
  }
  if (!below) for (let x = 0; x < TILE; x++) {
    r.set(ox + x, oy + TILE - 3, '#5c3a2a');
    r.set(ox + x, oy + TILE - 2, x % 5 === 0 ? '#3a2418' : '#8a4f38');
    r.set(ox + x, oy + TILE - 1, '#3a2418');
  }
}

function drawQuicksand(t: TileCtx): void {
  const { r, ox, oy, grid, tx, ty, phase } = t;
  for (let y = 0; y < TILE; y++) {
    for (let x = 0; x < TILE; x++) {
      const gx = tx * TILE + x;
      const gy = ty * TILE + y;
      // espiral alrededor del centro de cada parche de 2x2 tiles
      const cx = Math.floor(gx / 32) * 32 + 16;
      const cy = Math.floor(gy / 32) * 32 + 16;
      const dx = gx - cx;
      const dy = gy - cy;
      const d = Math.hypot(dx, dy);
      const a = Math.atan2(dy, dx);
      const v = Math.sin(d * 0.55 + a * 2 - phase * 2.5);
      let c = '#c99a55';
      if (v > 0.75) c = '#a87d42';
      else if (v < -0.8) c = '#ddb06a';
      r.set(ox + x, oy + y, c);
    }
  }
  const edge = (x: number, y: number) => !isCh(grid, x, y, 'q');
  if (edge(tx, ty - 1)) for (let x = 0; x < TILE; x++) r.set(ox + x, oy, '#b88a4f');
  if (edge(tx, ty + 1)) for (let x = 0; x < TILE; x++) r.set(ox + x, oy + TILE - 1, '#f0d18e');
  if (edge(tx - 1, ty)) for (let y = 0; y < TILE; y++) r.set(ox, oy + y, '#b88a4f');
  if (edge(tx + 1, ty)) for (let y = 0; y < TILE; y++) r.set(ox + TILE - 1, oy + y, '#b88a4f');
}

function drawIce(t: TileCtx): void {
  const { r, ox, oy, grid, tx, ty, rand } = t;
  for (let y = 0; y < TILE; y++) {
    for (let x = 0; x < TILE; x++) {
      const gx = tx * TILE + x;
      const gy = ty * TILE + y;
      let c = '#a6dff3';
      if ((gx + gy) % 23 === 0 || (gx + gy) % 23 === 1) c = '#d8f4ff';
      else if ((gx - gy * 2) % 37 === 0) c = '#8fd0ea';
      r.set(ox + x, oy + y, c);
    }
  }
  if (rand() < 0.35) {
    let x = ox + 2 + Math.floor(rand() * 10);
    let y = oy + 2 + Math.floor(rand() * 4);
    for (let i = 0; i < 7; i++) {
      r.set(x, y, '#76bfdc');
      x += rand() < 0.5 ? 1 : 0;
      y += 1;
    }
  }
  if (rand() < 0.2) r.set(ox + 3 + Math.floor(rand() * 10), oy + 3 + Math.floor(rand() * 10), '#ffffff');
  const edge = (x: number, y: number) => !isCh(grid, x, y, 'i');
  if (edge(tx, ty - 1)) for (let x = 0; x < TILE; x++) { r.set(ox + x, oy, '#ffffff'); r.set(ox + x, oy + 1, '#7cc8e8'); }
  if (edge(tx, ty + 1)) for (let x = 0; x < TILE; x++) r.set(ox + x, oy + TILE - 1, '#ffffff');
  if (edge(tx - 1, ty)) for (let y = 0; y < TILE; y++) r.set(ox, oy + y, '#ffffff');
  if (edge(tx + 1, ty)) for (let y = 0; y < TILE; y++) r.set(ox + TILE - 1, oy + y, '#ffffff');
}

function drawDeepSnow(t: TileCtx): void {
  const { r, ox, oy, rand } = t;
  for (let y = 0; y < TILE; y++) for (let x = 0; x < TILE; x++) {
    const n = rand();
    r.set(ox + x, oy + y, n < 0.22 ? '#c9d7ee' : n < 0.3 ? '#ffffff' : '#dfe8f6');
  }
  for (let k = 0; k < 2; k++) {
    const x = ox + 2 + Math.floor(rand() * 11);
    const y = oy + 2 + Math.floor(rand() * 11);
    r.set(x, y, '#b3c4e2');
    r.set(x + 1, y, '#b3c4e2');
    r.set(x, y + 1, '#c9d7ee');
  }
}

export function drawTreeBase(t: TileCtx): void {
  drawGround(t);
  const { r, ox, oy } = t;
  const shadow = t.id === 'snow' ? '#c5d3ea' : t.id === 'desert' ? '#c49a5a' : '#3a7a36';
  for (let y = 9; y < 16; y++) for (let x = 2; x < 14; x++) {
    const dx = (x - 8) / 6;
    const dy = (y - 12.5) / 3.2;
    if (dx * dx + dy * dy <= 1) r.set(ox + x, oy + y, shadow);
  }
}

function drawTile(t: TileCtx): void {
  if (drawCityTile(t, drawWater, drawSmallRock)) return;
  const c = t.grid.charAt(t.tx, t.ty);
  switch (c) {
    case '#':
      return drawRockWall(t);
    case 'R':
      return drawRuin(t);
    case 'r':
      return drawSmallRock(t);
    case 'n':
      return drawSnowPile(t);
    case '~':
      return drawWater(t);
    case '=':
      return drawBridge(t);
    case 'q':
      return drawQuicksand(t);
    case 'i':
      return drawIce(t);
    case 'd':
      return drawDeepSnow(t);
    case 'T':
      return drawTreeBase(t);
    default:
      return drawGround(t);
  }
}

/** Renderizador del suelo del mapa con animación de agua y arenas movedizas. */
export class GroundRenderer {
  readonly key: string;
  private ctx: CanvasRenderingContext2D;
  private tex: Phaser.Textures.CanvasTexture;
  private img: ImageData;
  private animTiles: number[] = [];
  private animBox = { x0: Infinity, y0: Infinity, x1: -1, y1: -1 };

  constructor(scene: Phaser.Scene, private grid: Grid, private id: BiomeId, key = 'ground') {
    this.key = key;
    const { tex, ctx } = makeCanvas(scene, key, grid.w * TILE, grid.h * TILE);
    this.tex = tex;
    this.ctx = ctx;
    this.img = ctx.createImageData(grid.w * TILE, grid.h * TILE);
    for (let ty = 0; ty < grid.h; ty++) {
      for (let tx = 0; tx < grid.w; tx++) {
        this.drawAt(tx, ty, 0);
        const c = grid.charAt(tx, ty);
        if (c === '~' || c === 'q') {
          this.animTiles.push(ty * grid.w + tx);
          this.animBox.x0 = Math.min(this.animBox.x0, tx);
          this.animBox.y0 = Math.min(this.animBox.y0, ty);
          this.animBox.x1 = Math.max(this.animBox.x1, tx);
          this.animBox.y1 = Math.max(this.animBox.y1, ty);
        }
      }
    }
    ctx.putImageData(this.img, 0, 0);
    tex.refresh();
  }

  private drawAt(tx: number, ty: number, phase: number): void {
    const seed = (tx * 73856093) ^ (ty * 19349663) ^ (this.id.length * 83492791);
    drawTile({
      r: new Raster(this.img),
      grid: this.grid,
      biome: BIOMES[this.id],
      id: this.id,
      tx,
      ty,
      ox: tx * TILE,
      oy: ty * TILE,
      rand: rng(seed),
      phase,
    });
  }

  get animated(): boolean {
    return this.animTiles.length > 0;
  }

  /** Redibuja solo los tiles animados. */
  animate(phase: number): void {
    if (!this.animTiles.length) return;
    for (const i of this.animTiles) this.drawAt(i % this.grid.w, Math.floor(i / this.grid.w), phase);
    const b = this.animBox;
    this.ctx.putImageData(this.img, 0, 0, b.x0 * TILE, b.y0 * TILE, (b.x1 - b.x0 + 1) * TILE, (b.y1 - b.y0 + 1) * TILE);
    this.tex.refresh();
  }
}

// ------------------------------------------------------------------ props (sprites con profundidad)

function buildTree(scene: Phaser.Scene, key: string, apples: boolean, seed: number): void {
  const g = new PixelGrid(24, 32);
  const rand = rng(seed);
  // tronco
  g.rect(10, 20, 4, 10, '#8f563b');
  g.rect(10, 20, 1, 10, '#5c3a2a');
  g.set(9, 29, '#8f563b');
  g.set(14, 29, '#8f563b');
  g.set(12, 24, '#5c3a2a');
  // copa
  g.ellipse(12, 12, 10.5, 9.5, '#265c42');
  g.ellipse(12, 11, 10, 8.5, '#3e8948');
  g.ellipse(9, 8, 6, 4.5, '#4fa34a');
  g.ellipse(8, 7, 3.5, 2.5, '#63c74d');
  g.ellipse(17, 14, 3, 2.5, '#326f3e');
  for (let i = 0; i < 30; i++) {
    const x = Math.floor(rand() * 24);
    const y = Math.floor(rand() * 22);
    if (g.get(x, y) === '#3e8948') g.set(x, y, rand() < 0.5 ? '#326f3e' : '#4fa34a');
  }
  if (apples) {
    [[6, 13], [15, 8], [17, 17], [11, 16]].forEach(([x, y]) => {
      g.set(x, y, PAL.red);
      g.set(x, y - 1, PAL.redLight);
    });
  }
  g.outline(PAL.outline);
  gridTexture(scene, key, g);
}

function buildBush(scene: Phaser.Scene): void {
  const g = new PixelGrid(20, 16);
  g.ellipse(6, 9, 5.5, 5, '#1f6232');
  g.ellipse(14, 9, 5.5, 5, '#1f6232');
  g.ellipse(10, 6.5, 6.5, 5, '#2f8a3c');
  g.ellipse(6, 9, 4.5, 4, '#2f8a3c');
  g.ellipse(14, 9.5, 4.5, 3.5, '#2f8a3c');
  g.ellipse(9, 5, 3, 2, '#4fb34c');
  g.ellipse(14, 8, 2, 1.5, '#4fb34c');
  g.ellipse(5, 8, 2, 1.5, '#4fb34c');
  [[7, 10], [12, 6], [15, 11], [4, 11]].forEach(([x, y]) => g.set(x, y, '#e43b44'));
  g.set(10, 11, '#f4f0e8');
  g.outline(PAL.outline);
  gridTexture(scene, 'bush', g);
}

function buildCactus(scene: Phaser.Scene, key: string, flower: boolean): void {
  const g = new PixelGrid(16, 28);
  const body = '#3e8948';
  g.rect(6, 4, 4, 22, body);
  g.rect(5, 6, 6, 20, body);
  g.rect(7, 3, 2, 1, body);
  // brazo izquierdo
  g.rect(1, 9, 3, 7, body);
  g.rect(2, 8, 1, 1, body);
  g.rect(1, 15, 5, 3, body);
  // brazo derecho
  g.rect(12, 6, 3, 6, body);
  g.rect(13, 5, 1, 1, body);
  g.rect(10, 11, 5, 3, body);
  // rayas
  for (let y = 4; y < 26; y++) {
    g.set(7, y, '#63c74d');
    if (y > 6) g.set(10, y, '#265c42');
  }
  for (let y = 9; y < 17; y++) g.set(2, y, '#63c74d');
  for (let y = 6; y < 12; y++) g.set(13, y, '#63c74d');
  // espinas
  [[5, 8], [10, 12], [5, 16], [10, 20], [5, 22], [0, 12], [15, 8], [8, 6], [4, 18]].forEach(([x, y]) => g.set(x, y, PAL.offWhite));
  if (flower) {
    g.set(7, 2, '#f6a3b0');
    g.set(8, 2, '#f6a3b0');
    g.set(7, 1, '#e43b44');
    g.set(8, 1, '#f6a3b0');
  }
  g.outline(PAL.outline);
  gridTexture(scene, key, g);
}

function buildPine(scene: Phaser.Scene, key: string, seed: number): void {
  const g = new PixelGrid(22, 32);
  const rand = rng(seed);
  g.rect(10, 25, 3, 6, '#5c3a2a');
  g.set(10, 25, '#8f563b');
  const tier = (top: number, bottom: number, halfW: number) => {
    for (let y = top; y <= bottom; y++) {
      const w = Math.round(((y - top) / (bottom - top)) * halfW) + 1;
      for (let x = 11 - w; x <= 11 + w; x++) {
        const edge = x === 11 - w || x === 11 + w;
        g.set(x, y, edge ? '#1d4a34' : x < 11 ? '#3e8948' : '#265c42');
      }
    }
    // nieve encima
    for (let y = top; y <= top + 2; y++) {
      const w = Math.round(((y - top) / (bottom - top)) * halfW) + 1;
      for (let x = 11 - w; x <= 11 + w; x++) if (rand() < 0.85) g.set(x, y, '#ffffff');
    }
    const w = halfW + 1;
    for (let x = 11 - w; x <= 11 + w; x += 2) if (rand() < 0.6) g.set(x, bottom, '#eaf1fb');
  };
  tier(15, 26, 10);
  tier(8, 18, 8);
  tier(2, 11, 5);
  g.outline(PAL.outline);
  gridTexture(scene, key, g);
}

export function buildCabin(scene: Phaser.Scene, key: string, wTiles: number, hTiles: number): void {
  if (scene.textures.exists(key)) return;
  const W = wTiles * TILE;
  const H = hTiles * TILE + 12;
  const g = new PixelGrid(W + 2, H + 2);
  const wallTop = Math.floor(H * 0.52);
  // paredes de troncos
  for (let y = wallTop; y < H; y++) {
    for (let x = 1; x < W - 1; x++) {
      const log = Math.floor((y - wallTop) / 4);
      let c = log % 2 === 0 ? '#9a5f3f' : '#8f563b';
      if ((y - wallTop) % 4 === 3) c = '#5c3a2a';
      g.set(x + 1, y + 1, c);
    }
  }
  // puerta
  const dx = Math.floor(W / 2) - 4;
  g.rect(dx + 1, H - 12 + 1, 8, 12, '#4a2c22');
  g.rect(dx + 2, H - 11 + 1, 6, 11, '#5c3a2a');
  g.set(dx + 7, H - 6 + 1, PAL.yellow);
  // ventanas
  const win = (x: number) => {
    g.rect(x + 1, wallTop + 4 + 1, 7, 6, '#3a2418');
    g.rect(x + 2, wallTop + 5 + 1, 5, 4, '#fee761');
    g.set(x + 4, wallTop + 5 + 1, '#3a2418');
    g.set(x + 4, wallTop + 6 + 1, '#3a2418');
    g.set(x + 4, wallTop + 7 + 1, '#3a2418');
    g.set(x + 4, wallTop + 8 + 1, '#3a2418');
    g.set(x + 3, wallTop + 6 + 1, '#ffffff');
  };
  if (W >= 48) {
    win(4);
    win(W - 11);
  } else {
    win(3);
  }
  // tejado
  for (let y = 0; y <= wallTop + 1; y++) {
    const inset = Math.max(0, Math.round((1 - y / (wallTop + 1)) * 6));
    for (let x = inset; x < W - inset; x++) {
      let c = (x + Math.floor(y / 3)) % 4 === 0 ? '#7a1c27' : '#a22633';
      if (y % 3 === 2) c = '#7a1c27';
      if (y < wallTop - 3) c = (x * 7 + y * 3) % 11 === 0 ? '#dce6f5' : '#ffffff';
      if (y === wallTop - 3 && x % 3 === 0) c = '#ffffff';
      g.set(x + 1, y + 1, c);
    }
  }
  for (let x = 2; x < W - 2; x += 3) {
    g.set(x + 1, wallTop + 2 + 1, '#d8f4ff');
    if (x % 2 === 0) g.set(x + 1, wallTop + 3 + 1, '#d8f4ff');
  }
  // chimenea
  g.rect(W - 12 + 1, 0, 5, 6, '#6e6e7e');
  g.rect(W - 12 + 1, 0, 5, 2, '#ffffff');
  g.outline(PAL.outline);
  gridTexture(scene, key, g);
}

export function buildPropTextures(scene: Phaser.Scene): void {
  buildTree(scene, 'tree0', false, 11);
  buildTree(scene, 'tree1', true, 23);
  buildBush(scene);
  buildCactus(scene, 'cactus0', false);
  buildCactus(scene, 'cactus1', true);
  buildPine(scene, 'pine0', 5);
  buildPine(scene, 'pine1', 9);
  buildCityProps(scene);
}

// ------------------------------------------------------------------ minimapa / previsualización

const MINI_COLORS: Record<BiomeId, Record<string, string>> = {
  forest: { '.': '#4f9a45', '#': '#7b89a6', T: '#265c42', b: '#2f8a3c', r: '#8b9bb4', '~': '#2f7fd1', '=': '#b86f50' },
  desert: { '.': '#e6bf72', '#': '#bb8a5a', T: '#3e8948', R: '#a07a55', r: '#a07a55', q: '#a87d42' },
  snow: { '.': '#eaf1fb', '#': '#6f7f9e', T: '#265c42', n: '#b8c7e0', H: '#a22633', i: '#7cc8e8', d: '#d0dcf0', r: '#8b9bb4' },
  paris: { '.': '#a9a49b', '#': '#7f8ea3', T: '#3e8948', ',': '#4f9a45', '~': '#4d7f8a', '=': '#bdb7ad', c: '#d8222c', M: '#2f6b4f', L: '#6e4f36', P: '#a9cfe0', b: '#2f8a3c' },
  barcelona: { '.': '#bdb7ad', '#': '#d8b48a', T: '#3e8948', S: '#cdb98f', g: '#3f8fd8', k: '#3a9d63', s: '#efd9a0', '~': '#2f7fd1', b: '#2f8a3c' },
  ceuta: { '.': '#efe6d2', '#': '#c9a46b', W: '#f6f4ee', T: '#3e8948', ',': '#4f9a45', '~': '#2f7fd1', '=': '#bdb7ad', s: '#efd9a0', C: '#7a5a34', r: '#8b9bb4', b: '#2f8a3c' },
};

export function buildMiniTexture(scene: Phaser.Scene, key: string, grid: Grid, id: BiomeId, scale: number): void {
  const { tex, ctx } = makeCanvas(scene, key, grid.w * scale, grid.h * scale);
  const colors = MINI_COLORS[id];
  for (let y = 0; y < grid.h; y++) {
    for (let x = 0; x < grid.w; x++) {
      const c = grid.charAt(x, y);
      ctx.fillStyle = colors[c] ?? colors['.'];
      ctx.fillRect(x * scale, y * scale, scale, scale);
    }
  }
  tex.refresh();
}
