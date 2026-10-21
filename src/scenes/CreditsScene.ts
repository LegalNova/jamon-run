import Phaser from 'phaser';
import { VIEW_H, VIEW_W } from '../config/balance';
import { audio } from '../core/audio';
import { input } from '../core/input';
import { FONT, fontText } from '../gfx/font';
import { Button, Menu, text, UI } from '../ui/widgets';
import { Backdrop, fadeIn, fadeTo } from './common';

const LINES: [string, number][] = [
  ['JAMONGUS', 0xfee761],
  ['', 0],
  ['DISEÑO Y PROGRAMACIÓN', 0x7cc8ff],
  ['HECHO A MANO CON PHASER 3 + TYPESCRIPT', 0xf4f0e8],
  ['', 0],
  ['PIXEL ART', 0x7cc8ff],
  ['CADA PÍXEL DIBUJADO CON CÓDIGO', 0xf4f0e8],
  ['', 0],
  ['MÚSICA Y SONIDO', 0x7cc8ff],
  ['SINTETIZADOR 8-BIT CON WEB AUDIO', 0xf4f0e8],
  ['', 0],
  ['ASSETS EXTERNOS USADOS', 0x7cc8ff],
  ['NINGUNO', 0xf4f0e8],
  ['', 0],
  ['NINGÚN JAMÓN FUE DAÑADO', 0xff7a6e],
  ['DURANTE EL DESARROLLO', 0xff7a6e],
  ['(BUENO, ALGUNO SÍ)', 0x8b9bb4],
  ['', 0],
  ['¡GRACIAS POR JUGAR!', 0xfee761],
];

export class CreditsScene extends Phaser.Scene {
  private menu!: Menu;
  private backdrop!: Backdrop;
  private scroller!: Phaser.GameObjects.Container;
  private height_ = 0;

  constructor() {
    super('Credits');
  }

  create(): void {
    fadeIn(this);
    this.backdrop = new Backdrop(this, true, 0.25);
    text(this, VIEW_W / 2, 14, 'CRÉDITOS', { scale: 2, color: UI.focusLight });
    this.scroller = this.add.container(0, 0);
    LINES.forEach(([s, c], i) => {
      if (!s) return;
      const t = this.add.bitmapText(VIEW_W / 2, i * 12, FONT, fontText(s)).setOrigin(0.5).setTint(c);
      if (i === 0) t.setScale(2);
      this.scroller.add(t);
    });
    this.height_ = LINES.length * 12;
    this.scroller.y = VIEW_H - 40;
    const mask = this.add.graphics().fillRect(0, 30, VIEW_W, VIEW_H - 80).setVisible(false);
    this.scroller.setMask(mask.createGeometryMask());
    this.menu = new Menu();
    this.menu.add(new Button(this, VIEW_W / 2, VIEW_H - 22, 'VOLVER', () => fadeTo(this, 'Menu'), 90, 16));
  }

  update(_t: number, delta: number): void {
    const dt = delta / 1000;
    this.backdrop.update(dt);
    this.scroller.y -= dt * 18;
    if (this.scroller.y < 30 - this.height_) this.scroller.y = VIEW_H - 50;
    if (input.back()) {
      audio.play('back');
      fadeTo(this, 'Menu');
      return;
    }
    this.menu.update();
  }
}
