import Phaser from 'phaser';
import { VIEW_H, VIEW_W } from '../config/balance';
import { audio } from '../core/audio';
import { Button, Menu, text, UI } from '../ui/widgets';
import { account } from '../net/account';
import { today } from '../../shared/economy';
import { addFullscreenButton, Backdrop, fadeIn, fadeTo } from './common';
import { mobileFullscreen } from '../core/touchControls';
import { createLogo, waveLogo } from './TitleScene';

export class MenuScene extends Phaser.Scene {
  private menu!: Menu;
  private backdrop!: Backdrop;
  private letters: Phaser.GameObjects.BitmapText[] = [];
  private t = 0;

  constructor() {
    super('Menu');
  }

  create(): void {
    fadeIn(this);
    audio.playMusic('menu');
    this.backdrop = new Backdrop(this, true);
    this.letters = createLogo(this, VIEW_W / 2, 36, 3);
    // Lonchas cayendo por detrás.
    this.add
      .particles(0, -10, 'icon_loncha', { x: { min: 0, max: VIEW_W }, lifespan: 7000, speedY: { min: 18, max: 40 }, speedX: { min: -8, max: 8 }, rotate: { min: 0, max: 360 }, alpha: { start: 0.55, end: 0.1 }, frequency: 420 })
      .setDepth(-5);
    this.menu = new Menu();
    const items: [string, () => void, number?][] = [
      ['JUGAR ONLINE', () => (mobileFullscreen(), fadeTo(this, 'Online')), UI.green],
      ['JUGAR CON BOTS', () => (mobileFullscreen(), fadeTo(this, 'ModeSelect')), UI.green],
      ['MINIJUEGOS', () => fadeTo(this, 'MinigameHub')],
      ['TIENDA', () => fadeTo(this, 'Shop')],
      ['MISIONES', () => fadeTo(this, 'Missions')],
      ['MI PERSONAJE', () => fadeTo(this, 'Character', { back: 'Menu' })],
      ['OPCIONES', () => fadeTo(this, 'Options', { from: 'Menu' })],
    ];
    items.forEach(([label, fn, color], i) => {
      this.menu.add(new Button(this, VIEW_W / 2, 64 + i * 21, label, fn, 150, 18, color));
    });
    // ¿Regalo diario sin recoger? Se avisa al lado de MISIONES.
    if (account.profile && account.profile.daily.last !== today()) {
      const gift = this.add.image(VIEW_W / 2 + 86, 64 + 4 * 21, 'icon_gift');
      this.tweens.add({ targets: gift, angle: { from: -12, to: 12 }, yoyo: true, repeat: -1, duration: 260 });
    }
    const small: [string, () => void][] = [
      ['RÉCORDS', () => fadeTo(this, 'Records')],
      ['CONTROLES', () => fadeTo(this, 'Controls')],
      ['CRÉDITOS', () => fadeTo(this, 'Credits')],
      ['SALIR', () => this.quit()],
    ];
    small.forEach(([label, fn], i) => this.menu.add(new Button(this, VIEW_W / 2 + (i - 1.5) * 76, VIEW_H - 32, label, fn, 72, 14)));
    text(this, VIEW_W / 2, VIEW_H - 14, '↑↓ ELEGIR · ENTER ACEPTAR · F PANTALLA COMPLETA', { color: UI.muted });
    addFullscreenButton(this);
  }

  private quit(): void {
    const desktop = (window as unknown as { jamonDesktop?: { quit: () => void } }).jamonDesktop;
    if (desktop) {
      desktop.quit();
      return;
    }
    // En el navegador window.close() solo funciona en algunas ventanas.
    window.close();
    this.time.delayedCall(150, () => fadeTo(this, 'Bye'));
  }

  update(_t: number, delta: number): void {
    const dt = delta / 1000;
    this.t += dt;
    this.backdrop.update(dt);
    waveLogo(this.letters, this.t, 2);
    this.menu.update();
  }
}
