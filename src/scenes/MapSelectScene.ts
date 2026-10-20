import Phaser from 'phaser';
import { VIEW_H, VIEW_W } from '../config/balance';
import { audio } from '../core/audio';
import { input } from '../core/input';
import { FONT, fontText } from '../gfx/font';
import { buildMiniTexture } from '../gfx/tiles';
import { Grid } from '../world/grid';
import { MapDef, MAPS } from '../world/maps';
import { Button, Focusable, Menu, text, UI } from '../ui/widgets';
import { Backdrop, fadeIn, fadeTo } from './common';

const ACCENTS: Record<string, number> = { forest: 0x63c74d, desert: 0xfeae34, snow: 0x7cc8ff, paris: 0x9aa7bf, barcelona: 0xe8c84a, ceuta: 0x5ab8e8 };
const TAGS: Record<string, string> = {
  forest: 'ESCONDITES',
  desert: 'ARENAS LENTAS',
  snow: 'HIELO RESBALADIZO',
  paris: 'METRO: TELETRANSPORTE',
  barcelona: 'CARRIL BICI TURBO',
  ceuta: 'RÁFAGAS DE LEVANTE',
};
const CW = 150;
const CH = 112;

class MapCard extends Phaser.GameObjects.Container implements Focusable {
  private g: Phaser.GameObjects.Graphics;
  private focused = false;
  enabled = true;
  menu?: Menu;
  private baseY: number;
  private t = Math.random() * 5;

  constructor(scene: Phaser.Scene, x: number, y: number, private def: MapDef, private onPick: () => void) {
    super(scene, x, y);
    this.baseY = y;
    const W = CW;
    const H = CH;
    this.g = scene.add.graphics();
    this.add(this.g);
    const accent = ACCENTS[def.id];
    const name = scene.add.bitmapText(0, -H / 2 + 12, FONT, fontText(def.name)).setOrigin(0.5).setScale(2).setTint(accent);
    const grid = new Grid(def.rows);
    const key = 'preview_' + def.id;
    buildMiniTexture(scene, key, grid, def.id, 2);
    const prev = scene.add.image(0, -H / 2 + 56, key);
    const frame = scene.add.graphics();
    frame.lineStyle(1, 0x0d0b14, 1).strokeRect(-49, -H / 2 + 25, 98, 62);
    const sub = scene.add.bitmapText(0, H / 2 - 20, FONT, fontText(def.subtitle)).setOrigin(0.5).setTint(UI.text);
    this.add([name, sub, frame, prev]);
    const tag = scene.add.bitmapText(0, H / 2 - 9, FONT, fontText('★ ' + TAGS[def.id])).setOrigin(0.5).setTint(accent);
    this.add(tag);
    this.setSize(W, H);
    this.setInteractive({ useHandCursor: true });
    this.on('pointerover', () => this.menu?.focusItem(this));
    this.on('pointerup', () => this.activate());
    this.redraw();
    scene.add.existing(this);
  }

  setFocused(f: boolean, silent = false): void {
    if (f && !this.focused && !silent) audio.play('hover');
    this.focused = f;
    this.redraw();
  }

  activate(): void {
    audio.play('click');
    this.scene.tweens.add({ targets: this, scale: 1.06, yoyo: true, duration: 90 });
    this.onPick();
  }

  tick(dt: number): void {
    this.t += dt;
    const target = this.focused ? this.baseY - 4 + Math.round(Math.sin(this.t * 4)) : this.baseY;
    this.y += (target - this.y) * Math.min(1, dt * 14);
  }

  private redraw(): void {
    const W = CW;
    const H = CH;
    const g = this.g;
    g.clear();
    g.fillStyle(0x000000, 0.4).fillRect(-W / 2 + 3, -H / 2 + 4, W, H);
    g.fillStyle(this.focused ? UI.focus : 0x0d0b14, 1).fillRect(-W / 2, -H / 2, W, H);
    g.fillStyle(this.focused ? UI.panelLight : UI.panel, 1).fillRect(-W / 2 + 2, -H / 2 + 2, W - 4, H - 4);
    g.fillStyle(ACCENTS[this.def.id], 1).fillRect(-W / 2 + 2, -H / 2 + 2, W - 4, 2);
    g.fillStyle(0xffffff, 0.06).fillRect(-W / 2 + 2, -H / 2 + 4, W - 4, 1);
  }
}

export class MapSelectScene extends Phaser.Scene {
  private menu!: Menu;
  private cards: MapCard[] = [];
  private backdrop!: Backdrop;

  constructor() {
    super('MapSelect');
  }

  create(): void {
    fadeIn(this);
    this.backdrop = new Backdrop(this, false);
    text(this, VIEW_W / 2, 8, 'ELIGE UN MAPA', { scale: 2, color: UI.focusLight });
    this.menu = new Menu(true);
    this.cards = MAPS.map((def, i) => {
      const col = i % 3;
      const row = Math.floor(i / 3);
      const card = new MapCard(this, VIEW_W / 2 + (col - 1) * 156, 83 + row * 114, def, () => {
        this.time.delayedCall(140, () => fadeTo(this, 'RoleReveal', { mapId: def.id }));
      });
      this.menu.add(card);
      return card;
    });
    this.menu.add(new Button(this, VIEW_W / 2, VIEW_H - 8, 'VOLVER', () => fadeTo(this, 'Menu'), 80, 13));
    text(this, VIEW_W / 2, 19, 'ARRIBA CLÁSICOS · ABAJO CIUDADES (NUEVO)', { color: UI.muted });
  }

  update(_t: number, delta: number): void {
    const dt = delta / 1000;
    this.backdrop.update(dt);
    for (const c of this.cards) c.tick(dt);
    if (input.back()) {
      audio.play('back');
      fadeTo(this, 'Menu');
      return;
    }
    const n = this.cards.length;
    const i = this.menu.index;
    if (input.nav('down')) this.menu.setIndex(i < 3 ? i + 3 : n);
    else if (input.nav('up')) this.menu.setIndex(i === n ? 4 : i >= 3 ? i - 3 : i);
    this.menu.update();
  }
}
