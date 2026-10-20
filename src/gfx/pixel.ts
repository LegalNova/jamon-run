import Phaser from 'phaser';
import { PAL } from './palette';

/** Pequeña "hoja" de píxeles en memoria (null = transparente). */
export class PixelGrid {
  readonly w: number;
  readonly h: number;
  readonly px: (string | null)[];

  constructor(w: number, h: number) {
    this.w = w;
    this.h = h;
    this.px = new Array(w * h).fill(null);
  }

  set(x: number, y: number, c: string | null): void {
    x = Math.round(x);
    y = Math.round(y);
    if (x < 0 || y < 0 || x >= this.w || y >= this.h) return;
    this.px[y * this.w + x] = c;
  }

  get(x: number, y: number): string | null {
    if (x < 0 || y < 0 || x >= this.w || y >= this.h) return null;
    return this.px[y * this.w + x];
  }

  rect(x: number, y: number, w: number, h: number, c: string | null): void {
    for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) this.set(x + i, y + j, c);
  }

  /** Dibuja filas de texto donde cada carácter se traduce con `map`. */
  pattern(x: number, y: number, rows: string[], map: Record<string, string | null>): void {
    rows.forEach((row, j) => {
      for (let i = 0; i < row.length; i++) {
        const ch = row[i];
        if (ch === ' ' || !(ch in map)) continue;
        this.set(x + i, y + j, map[ch]);
      }
    });
  }

  ellipse(cx: number, cy: number, rx: number, ry: number, c: string): void {
    for (let y = Math.floor(cy - ry); y <= Math.ceil(cy + ry); y++) {
      for (let x = Math.floor(cx - rx); x <= Math.ceil(cx + rx); x++) {
        const dx = (x + 0.5 - cx) / rx;
        const dy = (y + 0.5 - cy) / ry;
        if (dx * dx + dy * dy <= 1) this.set(x, y, c);
      }
    }
  }

  /** Contorno de 1 px alrededor de todo lo opaco. */
  outline(color: string = PAL.outline, diagonal = false): void {
    const add: number[] = [];
    for (let y = 0; y < this.h; y++) {
      for (let x = 0; x < this.w; x++) {
        if (this.get(x, y)) continue;
        const n =
          this.get(x - 1, y) || this.get(x + 1, y) || this.get(x, y - 1) || this.get(x, y + 1) ||
          (diagonal && (this.get(x - 1, y - 1) || this.get(x + 1, y - 1) || this.get(x - 1, y + 1) || this.get(x + 1, y + 1)));
        if (n) add.push(y * this.w + x);
      }
    }
    for (const i of add) this.px[i] = color;
  }

  flipX(): PixelGrid {
    const g = new PixelGrid(this.w, this.h);
    for (let y = 0; y < this.h; y++) for (let x = 0; x < this.w; x++) g.set(this.w - 1 - x, y, this.get(x, y));
    return g;
  }

  shifted(dx: number, dy: number): PixelGrid {
    const g = new PixelGrid(this.w, this.h);
    for (let y = 0; y < this.h; y++) for (let x = 0; x < this.w; x++) g.set(x + dx, y + dy, this.get(x, y));
    return g;
  }

  drawTo(ctx: CanvasRenderingContext2D, ox: number, oy: number): void {
    for (let y = 0; y < this.h; y++) {
      for (let x = 0; x < this.w; x++) {
        const c = this.px[y * this.w + x];
        if (!c) continue;
        ctx.fillStyle = c;
        ctx.fillRect(ox + x, oy + y, 1, 1);
      }
    }
  }
}

/** Crea una textura de canvas y devuelve su contexto. */
export function makeCanvas(scene: Phaser.Scene, key: string, w: number, h: number): { tex: Phaser.Textures.CanvasTexture; ctx: CanvasRenderingContext2D } {
  if (scene.textures.exists(key)) scene.textures.remove(key);
  const tex = scene.textures.createCanvas(key, w, h)!;
  const ctx = tex.getContext();
  ctx.imageSmoothingEnabled = false;
  return { tex, ctx };
}

/** Registra una única PixelGrid como textura. */
export function gridTexture(scene: Phaser.Scene, key: string, g: PixelGrid): void {
  const { tex, ctx } = makeCanvas(scene, key, g.w, g.h);
  g.drawTo(ctx, 0, 0);
  tex.refresh();
}

/** Registra varias PixelGrid como frames de una sola textura (tira horizontal). */
export function stripTexture(scene: Phaser.Scene, key: string, frames: { name: string; grid: PixelGrid }[]): void {
  const fw = frames[0].grid.w;
  const fh = frames[0].grid.h;
  const { tex, ctx } = makeCanvas(scene, key, fw * frames.length, fh);
  frames.forEach((f, i) => {
    f.grid.drawTo(ctx, i * fw, 0);
    tex.add(f.name, 0, i * fw, 0, fw, fh);
  });
  tex.refresh();
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
