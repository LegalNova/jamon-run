import Phaser from 'phaser';
import { VIEW_W } from '../config/balance';
import { audio } from '../core/audio';
import { input } from '../core/input';
import { Button, Menu, text, UI } from '../ui/widgets';
import { Backdrop, fadeIn, fadeTo } from './common';

/** Pantalla de despedida (en el navegador no siempre se puede cerrar la pestaña). */
export class ByeScene extends Phaser.Scene {
  private menu!: Menu;
  private backdrop!: Backdrop;

  constructor() {
    super('Bye');
  }

  create(): void {
    fadeIn(this);
    audio.playMusic(null);
    this.backdrop = new Backdrop(this, true, 0.3);
    text(this, VIEW_W / 2, 70, '¡GRACIAS POR JUGAR!', { scale: 2, color: UI.focusLight });
    text(this, VIEW_W / 2, 100, 'YA PUEDES CERRAR ESTA PESTAÑA', { color: UI.text });
    text(this, VIEW_W / 2, 114, 'O VOLVER A POR MÁS JAMÓN.', { color: UI.muted });
    this.menu = new Menu();
    this.menu.add(new Button(this, VIEW_W / 2, 150, 'VOLVER AL MENÚ', () => fadeTo(this, 'Menu'), 130, 18));
  }

  update(_t: number, delta: number): void {
    this.backdrop.update(delta / 1000);
    if (input.back()) fadeTo(this, 'Menu');
    this.menu.update();
  }
}
