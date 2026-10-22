import Phaser from 'phaser';
import { TILE } from '../config/balance';
import { clampToMap, moveCircle, resolveCircle } from '../../shared/collision';
import { buildCabin, buildMiniTexture, GroundRenderer } from '../gfx/tiles';
import { buildLandmark } from '../gfx/cityTiles';
import { FONT, fontText } from '../gfx/font';
import { doorHorizontal, switchSpot } from '../gfx/houseTiles';
import { CASINO_NAMES, casinoColor } from '../gfx/vegasTiles';
import { houseLayout, lightOn } from '../../shared/house';
import { quality } from '../core/quality';
import { Grid, Terrain } from './grid';
import { BiomeId } from './maps';

interface Neon {
  objs: { setAlpha(a: number): unknown }[];
  /** Segundos hasta el próximo parpadeo y cuánto le queda apagado. */
  next: number;
  off: number;
}

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
  /** Las Vegas: carteles y luces que parpadean. */
  private neons: Neon[] = [];
  private signs = 0;
  /** La casa: puertas e indicadores de los interruptores. */
  private doors: { i: number; img: Phaser.GameObjects.Image; horiz: boolean; flip: boolean; closed: number }[] = [];
  private switches: { room: number; dot: Phaser.GameObjects.Rectangle; on: boolean | null }[] = [];

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
          const key =
            this.id === 'forest' || this.id === 'paris'
              ? `tree${v}`
              : this.id === 'desert'
                ? `cactus${v}`
                : this.id === 'snow'
                  ? `pine${v}`
                  : `palm${v}`;
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
        } else if (c === 'M') {
          this.scene.add.image(tx * TILE + 3, (ty + 1) * TILE - 4, this.id === 'vegas' ? 'lift_sign' : 'metro_sign').setOrigin(0.5, 1).setDepth((ty + 1) * TILE - 4);
        } else if (c === 'Y') {
          // tragaperras con su luz parpadeando
          this.scene.add.image(tx * TILE + TILE / 2, (ty + 1) * TILE + 1, `slot${v}`).setOrigin(0.5, 1).setDepth((ty + 1) * TILE - 2);
          const glow = this.scene.add.circle(tx * TILE + TILE / 2, (ty + 1) * TILE - 19, 4, 0xff4fd8, 0.35).setDepth((ty + 1) * TILE - 1);
          this.neons.push({ objs: [glow], next: Math.random() * 2, off: 0 });
        } else if (c === 'V' && !seen[ty * g.w + tx]) {
          // coche (ocupa un rectángulo de tiles)
          let w = 0;
          while (g.charAt(tx + w, ty) === 'V') w++;
          let h = 0;
          while ([...Array(w).keys()].every((i) => g.charAt(tx + i, ty + h) === 'V')) h++;
          for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) seen[(ty + j) * g.w + tx + i] = 1;
          this.scene.add
            .image(tx * TILE + (w * TILE) / 2, (ty + h) * TILE + 2, `car${(tx * 3 + ty) % 4}`)
            .setOrigin(0.5, 1)
            .setDepth((ty + h) * TILE - 2);
        } else if (c === 'N' && !seen[ty * g.w + tx]) {
          let w = 0;
          while (g.charAt(tx + w, ty) === 'N') w++;
          let h = 0;
          while ([...Array(w).keys()].every((i) => g.charAt(tx + i, ty + h) === 'N')) h++;
          for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) seen[(ty + j) * g.w + tx + i] = 1;
          this.casinoSign(tx, ty, w, h);
        } else if (c === 'D') {
          const horiz = doorHorizontal(g, tx, ty);
          const flip = horiz ? g.charAt(tx - 1, ty) === 'D' : g.charAt(tx, ty - 1) === 'D';
          const img = this.scene.add.image(tx * TILE, ty * TILE, horiz ? 'door_h' : 'door_v').setOrigin(0).setDepth(-900);
          this.doors.push({ i: ty * g.w + tx, img, horiz, flip, closed: -1 });
        } else if (c === 'J') {
          const room = houseLayout(g)?.roomOf[ty * g.w + tx] ?? -1;
          const p = switchSpot(g, tx, ty);
          const dot = this.scene.add.rectangle(tx * TILE + p.x, ty * TILE + p.y, 2, 3, 0xfee761).setDepth(-899);
          this.switches.push({ room, dot, on: null });
        } else if ('LPSC'.includes(c) && !seen[ty * g.w + tx]) {
          // monumento: rectángulo de tiles con un sprite grande encima
          let w = 0;
          while (g.charAt(tx + w, ty) === c) w++;
          let h = 0;
          while ([...Array(w).keys()].every((i) => g.charAt(tx + i, ty + h) === c)) h++;
          for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) seen[(ty + j) * g.w + tx + i] = 1;
          const key = `landmark_${c}_${w}x${h}`;
          buildLandmark(this.scene, key, c, w, h);
          this.scene.add
            .image(tx * TILE + (w * TILE) / 2, (ty + h) * TILE + 1, key)
            .setOrigin(0.5, 1)
            .setDepth((ty + h) * TILE - 2);
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

  /** Cartel de neón con un nombre de casino inventado, encima de la azotea. */
  private casinoSign(tx: number, ty: number, w: number, h: number): void {
    const color = Phaser.Display.Color.HexStringToColor(casinoColor(this.grid, tx, ty)).color;
    const pw = w * TILE;
    const roofH = h * TILE - 7;
    const cx = tx * TILE + pw / 2;
    const cy = ty * TILE + roofH / 2 + 1;
    const start = this.signs++ % CASINO_NAMES.length;
    let label: Phaser.GameObjects.BitmapText | null = null;
    for (let k = 0; k < CASINO_NAMES.length && !label; k++) {
      const t = this.scene.add.bitmapText(cx, cy, FONT, fontText(CASINO_NAMES[(start + k) % CASINO_NAMES.length])).setOrigin(0.5);
      if (t.width <= pw - 8 && roofH >= 14) label = t;
      else t.destroy();
    }
    const depth = (ty + h) * TILE - 8;
    const bw = label ? label.width + 6 : Math.min(pw - 6, 24);
    const plate = this.scene.add.rectangle(cx, cy, bw, 11, 0x140d1c, 0.85).setStrokeStyle(1, color).setDepth(depth);
    const glow = this.scene.add.rectangle(cx, cy, bw + 6, 17, color, 0.18).setDepth(depth - 1);
    const objs: Neon['objs'] = [plate, glow];
    if (label) objs.push(label.setTint(color).setDepth(depth + 1));
    this.neons.push({ objs, next: 1 + Math.random() * 4, off: 0 });
  }

  /** Fuente de Las Vegas: chorros de agua en el centro del estanque. */
  addFountain(): void {
    if (this.id !== 'vegas') return;
    const g = this.grid;
    const water: number[] = [];
    for (let i = 0; i < g.w * g.h; i++) if (g.charAt(i % g.w, (i / g.w) | 0) === '~') water.push(i);
    if (!water.length) return;
    // un chorro por cada estanque (en los mapas escalados hay varios)
    const done = new Set<number>();
    for (const i of water) {
      if (done.has(i)) continue;
      const stack = [i];
      const pool: number[] = [];
      done.add(i);
      while (stack.length) {
        const k = stack.pop()!;
        pool.push(k);
        for (const n of [k + 1, k - 1, k + g.w, k - g.w]) if (!done.has(n) && g.charAt(n % g.w, (n / g.w) | 0) === '~') {
          done.add(n);
          stack.push(n);
        }
      }
      const cx = (pool.reduce((a, k) => a + (k % g.w), 0) / pool.length + 0.5) * TILE;
      const cy = (pool.reduce((a, k) => a + ((k / g.w) | 0), 0) / pool.length + 0.5) * TILE;
      for (const dx of [-40, 0, 40]) {
        this.scene.add
          .particles(cx + dx, cy, 'p_dot', {
            lifespan: 900,
            speedY: { min: dx ? -70 : -100, max: dx ? -50 : -80 },
            speedX: { min: -14, max: 14 },
            gravityY: 150,
            scale: { min: 1, max: 2 },
            alpha: { start: 0.9, end: 0.2 },
            tint: [0xffffff, 0xbfe9ff, 0x8fd3ff],
            frequency: 45,
          })
          .setDepth(cy + 24);
      }
    }
  }

  /** La casa: dibuja las puertas según estén abiertas o cerradas. */
  syncDoors(): void {
    for (const d of this.doors) {
      const closed = this.grid.doorClosed[d.i];
      if (closed === d.closed) continue;
      d.closed = closed;
      if (closed) d.img.setTexture(d.horiz ? 'door_h' : 'door_v').setFlip(false, false);
      else d.img.setTexture(d.horiz ? 'door_h_open' : 'door_v_open').setFlip(d.horiz && d.flip, !d.horiz && d.flip);
    }
  }

  /** La casa: luz de los interruptores (amarilla = encendida). */
  syncLights(packed: number[] | undefined): void {
    for (const s of this.switches) {
      const on = lightOn(packed, s.room);
      if (on === s.on) continue;
      s.on = on;
      s.dot.setFillStyle(on ? 0xfee761 : 0x5a2a3a);
    }
  }

  update(dt: number): void {
    for (const n of quality.low ? [] : this.neons) {
      if (n.off > 0) {
        n.off -= dt;
        if (n.off <= 0) for (const o of n.objs) o.setAlpha(1);
        continue;
      }
      n.next -= dt;
      if (n.next <= 0) {
        // parpadeo corto (a veces doble)
        n.off = 0.06 + Math.random() * 0.12;
        n.next = Math.random() < 0.3 ? 0.15 : 1.5 + Math.random() * 5;
        for (const o of n.objs) o.setAlpha(0.25);
      }
    }
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
