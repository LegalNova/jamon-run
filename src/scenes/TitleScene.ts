import Phaser from 'phaser';
import { VIEW_H, VIEW_W } from '../config/balance';
import { audio } from '../core/audio';
import { input } from '../core/input';
import { FONT } from '../gfx/font';
import { text, UI } from '../ui/widgets';
import { applyFullscreen, Backdrop, fadeIn, fadeTo } from './common';
import { mobileFullscreen } from '../core/touchControls';

/** Crea el logo "JAMÓN RUN" con letras sueltas que ondulan. */
export function createLogo(scene: Phaser.Scene, cx: number, cy: number, scale: number): Phaser.GameObjects.BitmapText[] {
  const word = 'JAMONGUS';
  const letters: Phaser.GameObjects.BitmapText[] = [];
  const widths = word.split('').map((c) => (c === ' ' ? 3 : c === 'Ó' || c === 'M' || c === 'N' || c === 'A' || c === 'J' || c === 'R' || c === 'U' ? 6 : 6));
  const total = widths.reduce((a, b) => a + b, 0) * scale;
  let x = cx - total / 2;
  word.split('').forEach((c, i) => {
    if (c !== ' ') {
      const t = scene.add.bitmapText(Math.round(x), cy, FONT, c).setScale(scale).setOrigin(0, 0.5);
      if (i < 5) t.setTint(0xff8a7a, 0xff8a7a, 0xc2414b, 0xc2414b);
      else t.setTint(0xfee761, 0xfee761, 0xfeae34, 0xfeae34);
      t.setData('baseY', cy);
      t.setData('i', i);
      letters.push(t);
    }
    x += widths[i] * scale;
  });
  return letters;
}

export function waveLogo(letters: Phaser.GameObjects.BitmapText[], t: number, amp = 3): void {
  for (const l of letters) {
    const i = l.getData('i') as number;
    l.y = Math.round((l.getData('baseY') as number) + Math.sin(t * 3 + i * 0.6) * amp);
  }
}

export class TitleScene extends Phaser.Scene {
  private backdrop!: Backdrop;
  private letters: Phaser.GameObjects.BitmapText[] = [];
  private press!: Phaser.GameObjects.BitmapText;
  private ham!: Phaser.GameObjects.Image;
  private t = 0;
  private armed = false;

  constructor() {
    super('Title');
  }

  create(): void {
    fadeIn(this);
    this.t = 0;
    this.armed = false;
    this.backdrop = new Backdrop(this, true);
    this.letters = createLogo(this, VIEW_W / 2, 84, 5);
    this.ham = this.add.image(VIEW_W / 2, 36, 'ham').setScale(3);
    text(this, VIEW_W / 2, 122, 'PILLA-PILLA A JAMONAZOS', { color: UI.focusLight });
    this.press = text(this, VIEW_W / 2, 170, 'PULSA CUALQUIER TECLA', { color: UI.text });
    text(this, VIEW_W / 2, 186, 'O HAZ CLIC PARA EMPEZAR', { color: UI.muted });
    text(this, VIEW_W - 6, VIEW_H - 6, 'V1.0', { color: UI.muted, origin: [1, 1] });
    this.input.once('pointerdown', () => this.go());
    audio.playMusic('menu');
    // Evita que una tecla que venía pulsada de otra escena salte la portada.
    this.time.delayedCall(250, () => (this.armed = true));
  }

  private go(): void {
    audio.unlock();
    audio.playMusic('menu');
    audio.play('click');
    applyFullscreen();
    mobileFullscreen();
    // Enlace de invitación (?sala=CODIGO): directo a la sala.
    const params = new URLSearchParams(location.search);
    const sala = params.get('sala');
    if (sala) {
      params.delete('sala');
      const rest = params.toString();
      history.replaceState(null, '', location.pathname + (rest ? `?${rest}` : ''));
      fadeTo(this, 'Online', { join: sala });
    } else fadeTo(this, 'Menu');
  }

  update(_time: number, delta: number): void {
    const dt = delta / 1000;
    this.t += dt;
    this.backdrop.update(dt);
    waveLogo(this.letters, this.t, 3);
    this.ham.setRotation(Math.sin(this.t * 2.2) * 0.5);
    this.ham.y = 36 + Math.round(Math.sin(this.t * 3) * 2);
    this.press.setVisible(Math.floor(this.t * 2.2) % 2 === 0);
    if (this.armed && input.anyPressedNow()) this.go();
  }
}
