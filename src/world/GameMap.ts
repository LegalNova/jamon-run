import Phaser from 'phaser';
import { TILE } from '../config/balance';
import { clampToMap, moveCircle, resolveCircle } from '../../shared/collision';
import { buildCabin, buildMiniTexture, GroundRenderer } from '../gfx/tiles';
import { Grid, Terrain } from './grid';
import { BiomeId } from './maps';

export interface Vec {
  x: number;
  y: number;
}

/** Mapa jugable: render, props con profundidad y colisiones. */
export class GameMap {
  readonly grid: Grid;
  readonly id: BiomeId;
  readonly widthPx: number;
  readonly heightPx: number;
  readonly bushes = new Map<number, Phaser.GameObjects.Image>();
  private ground: GroundRenderer;
  private animClock = 0;
  private animPhase = 0;

  /** Escala del minimapa (px por tile): los mapas grandes se dibujan más pequeños. */
  readonly miniScale: number;

  constructor(private scene: Phaser.Scene, id: BiomeId, grid: Grid) {
    this.id = id;
    this.grid = grid;
    this.widthPx = this.grid.w * TILE;
    this.heightPx = this.grid.h * TILE;

    this.ground = new GroundRenderer(scene, this.grid, id, 'ground_' + id);
    scene.add.image(0, 0, this.ground.key).setOrigin(0).setDepth(-1000);
    this.miniScale = this.grid.w > 60 ? 1 : 2;
    buildMiniTexture(scene, 'mini_' + id, this.grid, id, this.miniScale);
    this.buildProps();
  }

  private buildProps(): void {
    const g = this.grid;
    const seen = new Uint8Array(g.w * g.h);
    for (let ty = 0; ty < g.h; ty++) {
      for (let tx = 0; tx < g.w; tx++) {
        const c = g.charAt(tx, ty);
        const v = (tx * 7 + ty * 13) % 2;
        if (c === 'T') {
          const key = this.id === 'forest' ? `tree${v}` : this.id === 'desert' ? `cactus${v}` : `pine${v}`;
          const yOff = this.id === 'desert' ? 2 : 2;
          this.scene.add
            .image(tx * TILE + TILE / 2, (ty + 1) * TILE + yOff, key)
            .setOrigin(0.5, 1)
            .setDepth((ty + 1) * TILE - 2);
        } else if (c === 'b') {
          const img = this.scene.add
            .image(tx * TILE + TILE / 2, ty * TILE + TILE / 2 + 2, 'bush')
            .setDepth((ty + 1) * TILE + 4)
            .setAlpha(0.95);
          if ((tx + ty) % 2) img.setFlipX(true);
          this.bushes.set(ty * g.w + tx, img);
        } else if (c === 'H' && !seen[ty * g.w + tx]) {
          // rectángulo de cabaña
          let w = 0;
          while (g.charAt(tx + w, ty) === 'H') w++;
          let h = 0;
          while ([...Array(w).keys()].every((i) => g.charAt(tx + i, ty + h) === 'H')) h++;
          for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) seen[(ty + j) * g.w + tx + i] = 1;
          const key = `cabin_${w}x${h}`;
          buildCabin(this.scene, key, w, h);
          this.scene.add
            .image(tx * TILE - 1, (ty + h) * TILE + 1, key)
            .setOrigin(0, 1)
            .setDepth((ty + h) * TILE - 2);
        }
      }
    }
  }

  update(dt: number): void {
    if (!this.ground.animated) return;
    this.animClock += dt;
    this.animPhase += dt;
    if (this.animClock >= 0.2) {
      this.animClock = 0;
      this.ground.animate(this.animPhase);
    }
  }

  terrainAt(x: number, y: number): Terrain {
    return this.grid.terrainAt(x, y);
  }

  bushAt(x: number, y: number): Phaser.GameObjects.Image | undefined {
    return this.bushes.get(this.grid.tileOf(x, y));
  }

  resolveCircle(p: Vec, r: number): { hitX: boolean; hitY: boolean } {
    return resolveCircle(this.grid, p, r);
  }

  moveCircle(p: Vec, dx: number, dy: number, r: number): { hitX: boolean; hitY: boolean } {
    return moveCircle(this.grid, p, dx, dy, r);
  }

  clampToMap(p: Vec, margin = 8): void {
    clampToMap(this.grid, p, margin);
  }
}
