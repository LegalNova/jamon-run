import Phaser from 'phaser';
import { VIEW_H, VIEW_W } from '../config/balance';
import { audio } from '../core/audio';
import { Button, Menu, text, UI } from '../ui/widgets';
import { addFullscreenButton, Backdrop, fadeIn, fadeTo } from './common';
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
    this.menu = new Menu();
    const items: [string, () => void][] = [
      ['JUGAR ONLINE', () => fadeTo(this, 'Online')],
      ['JUGAR CON BOTS', () => fadeTo(this, 'ModeSelect')],
      ['TIENDA', () => fadeTo(this, 'Shop')],
      ['MISIONES', () => fadeTo(this, 'Missions')],
      ['MI PERSONAJE', () => fadeTo(this, 'Character', { back: 'Menu' })],
      ['RÉCORDS', () => fadeTo(this, 'Records')],
      ['OPCIONES', () => fadeTo(this, 'Options', { from: 'Menu' })],
      ['CONTROLES', () => fadeTo(this, 'Controls')],
      ['CRÉDITOS', () => fadeTo(this, 'Credits')],
      ['SALIR', () => this.quit()],
    ];
    items.forEach(([label, fn], i) => {
      this.menu.add(new Button(this, VIEW_W / 2, 64 + i * 19, label, fn, 130, 16, i === 0 ? UI.green : undefined));
    });
    text(this, VIEW_W / 2, VIEW_H - 50, '↑↓ ELEGIR · ENTER ACEPTAR · F PANTALLA COMPLETA', { color: UI.muted });
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
