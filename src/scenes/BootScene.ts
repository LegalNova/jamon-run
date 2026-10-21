import Phaser from 'phaser';
import { buildCharacterTextures } from '../gfx/characters';
import { buildFonts } from '../gfx/font';
import { buildModeArt } from '../gfx/modeArt';
import { makeCanvas } from '../gfx/pixel';
import { buildPropTextures } from '../gfx/tiles';

/** Genera por código todas las texturas, fuentes y animaciones. */
export class BootScene extends Phaser.Scene {
  constructor() {
    super('Boot');
  }

  create(): void {
    buildFonts(this);
    buildCharacterTextures(this);
    buildPropTextures(this);
    buildModeArt(this);
    this.buildBackground();
    this.buildFullscreenIcon();
    this.scene.start('Title');
  }

  private buildFullscreenIcon(): void {
    const { tex, ctx } = makeCanvas(this, 'icon_fullscreen', 13, 13);
    const rows = ['#####...#####', '#...#...#...#', '#.###...###.#', '#.#.......#.#', '###.......###', '.............', '.............', '.............', '###.......###', '#.#.......#.#', '#.###...###.#', '#...#...#...#', '#####...#####'];
    rows.forEach((r, y) => {
      for (let x = 0; x < r.length; x++) {
        if (r[x] !== '#') continue;
        const edge = x === 0 || y === 0 || x === 12 || y === 12 || r[x - 1] === '.' || r[x + 1] === '.' || rows[y - 1]?.[x] === '.' || rows[y + 1]?.[x] === '.';
        ctx.fillStyle = edge ? '#1a1424' : '#f4f0e8';
        ctx.fillRect(x, y, 1, 1);
      }
    });
    tex.refresh();
  }

  private buildBackground(): void {
    const { tex, ctx } = makeCanvas(this, 'bg_pattern', 32, 32);
    ctx.fillStyle = '#1a1428';
    ctx.fillRect(0, 0, 32, 32);
    ctx.fillStyle = '#211a33';
    ctx.fillRect(0, 0, 16, 16);
    ctx.fillRect(16, 16, 16, 16);
    ctx.fillStyle = '#2a2140';
    ctx.fillRect(7, 7, 2, 2);
    ctx.fillRect(23, 23, 2, 2);
    ctx.fillStyle = '#1f1830';
    ctx.fillRect(23, 7, 1, 1);
    ctx.fillRect(7, 23, 1, 1);
    tex.refresh();
  }
}
