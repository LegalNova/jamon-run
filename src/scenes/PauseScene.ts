import Phaser from 'phaser';
import { VIEW_H, VIEW_W } from '../config/balance';
import { audio } from '../core/audio';
import { input } from '../core/input';
import { Button, Menu, panel, text, UI } from '../ui/widgets';
import type { GameScene } from './GameScene';
import { fitMenuCamera, toggleFullscreen, viewSize } from './common';

export class PauseScene extends Phaser.Scene {
  private menu!: Menu;
  private ready = false;
  private online = false;

  constructor() {
    super('Pause');
  }

  init(data: { online?: boolean }): void {
    this.online = !!data.online;
  }

  create(): void {
    this.ready = false;
    const dim = this.add.rectangle(0, 0, VIEW_W, VIEW_H, 0x0d0b14, 0.7).setOrigin(0).setScrollFactor(0);
    fitMenuCamera(this, () => {
      const { W, H } = viewSize(this);
      dim.setSize(Math.ceil(W), Math.ceil(H));
    });
    const g = this.add.graphics();
    panel(g, VIEW_W / 2 - 80, 36, 160, 190);
    text(this, VIEW_W / 2, 54, 'PAUSA', { scale: 2, color: UI.focusLight });
    if (this.online) text(this, VIEW_W / 2, 70, 'LA PARTIDA ONLINE SIGUE', { color: UI.focus });
    this.menu = new Menu();
    const items: [string, () => void][] = [
      ['CONTINUAR', () => this.resumeGame()],
      ['REINICIAR', () => this.restart()],
      ['OPCIONES', () => this.options()],
      ['PANTALLA COMPLETA', () => toggleFullscreen()],
      [this.online ? 'SALIR DE LA SALA' : 'SALIR AL MENÚ', () => this.exit()],
    ];
    items.forEach(([l, fn], i) => {
      const b = this.menu.add(new Button(this, VIEW_W / 2, 88 + i * 24, l, fn, 132, 17));
      if (this.online && i === 1) b.setEnabled(false);
    });
    text(this, VIEW_W / 2, VIEW_H - 20, 'ESC: CONTINUAR · F: PANTALLA COMPLETA', { color: UI.muted });
    this.events.on(Phaser.Scenes.Events.WAKE, () => {
      this.ready = false;
      this.time.delayedCall(80, () => (this.ready = true));
    });
    this.time.delayedCall(80, () => (this.ready = true));
  }

  private resumeGame(): void {
    input.consume();
    if (!this.online) {
      this.scene.resume('Game');
      this.scene.resume('UI');
    }
    this.scene.stop();
  }

  private restart(): void {
    input.consume();
    const game = this.scene.get('Game') as GameScene;
    this.scene.stop();
    game.restartMatch();
  }

  private options(): void {
    this.scene.launch('Options', { from: 'Pause' });
    this.scene.bringToTop('Options');
    this.scene.sleep();
  }

  private exit(): void {
    input.consume();
    const game = this.scene.get('Game') as GameScene;
    game.model?.destroy();
    this.scene.stop('UI');
    this.scene.stop('Game');
    audio.playMusic('menu');
    this.scene.start('Menu');
  }

  update(): void {
    if (!this.ready) return;
    if (input.back()) {
      audio.play('back');
      this.resumeGame();
      return;
    }
    this.menu.update();
  }
}
