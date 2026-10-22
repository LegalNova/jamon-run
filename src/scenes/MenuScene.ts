import Phaser from 'phaser';
import { VIEW_H, VIEW_W } from '../config/balance';
import { audio } from '../core/audio';
import { Button, Menu, text, UI } from '../ui/widgets';
import { input } from '../core/input';
import { IS_TOUCH } from '../core/touch';
import { settings } from '../config/settings';
import { profile, saveLook } from '../config/profile';
import { cleanName, NAME_MAX } from '../../shared/look';
import { account } from '../net/account';
import { today } from '../../shared/economy';
import { addFullscreenButton, applyFullscreen, Backdrop, fadeIn, fadeTo } from './common';
import { mobileFullscreen } from '../core/touchControls';
import { createLogo, waveLogo } from './TitleScene';

export class MenuScene extends Phaser.Scene {
  private menu!: Menu;
  private backdrop!: Backdrop;
  private letters: Phaser.GameObjects.BitmapText[] = [];
  private t = 0;
  private nameBtn!: Button;
  private typing = false;

  constructor() {
    super('Menu');
  }

  create(): void {
    fadeIn(this);
    audio.playMusic('menu');
    this.typing = false;
    this.backdrop = new Backdrop(this, true);
    this.letters = createLogo(this, VIEW_W / 2, 30, 4);
    // Lonchas cayendo por detrás.
    this.add
      .particles(0, -10, 'icon_loncha', { x: { min: 0, max: VIEW_W }, lifespan: 7000, speedY: { min: 18, max: 40 }, speedX: { min: -8, max: 8 }, rotate: { min: 0, max: 360 }, alpha: { start: 0.55, end: 0.1 }, frequency: 420 })
      .setDepth(-5);
    this.menu = new Menu();
    // 0: nombre · 1: JUGAR · 2..: el resto, más pequeño y debajo
    this.nameBtn = this.menu.add(new Button(this, VIEW_W / 2, 62, '', () => this.toggleTyping(), 170, 16, UI.focus));
    this.refreshName();
    const play = this.menu.add(new Button(this, VIEW_W / 2, 98, 'JUGAR', () => this.play(), 220, 40, UI.green).setLabelScale(3));
    this.tweens.add({ targets: play, scale: 1.04, yoyo: true, repeat: -1, duration: 600, ease: 'Sine.easeInOut' });
    const rows: [string, () => void, number?][][] = [
      [
        ['ONLINE', () => (mobileFullscreen(), fadeTo(this, 'Online')), UI.green],
        ['MINIJUEGOS', () => fadeTo(this, 'MinigameHub')],
        ['TIENDA', () => fadeTo(this, 'Shop')],
        ['MISIONES', () => fadeTo(this, 'Missions')],
      ],
      [
        ['MI PERSONAJE', () => fadeTo(this, 'Character', { back: 'Menu' })],
        ['CÓMO JUGAR', () => fadeTo(this, 'Tutorial', { howto: true })],
        ['OPCIONES', () => fadeTo(this, 'Options', { from: 'Menu' })],
        ['RÉCORDS', () => fadeTo(this, 'Records')],
      ],
    ];
    rows.forEach((row, r) =>
      row.forEach(([label, fn, color], i) => this.menu.add(new Button(this, VIEW_W / 2 + (i - 1.5) * 112, 142 + r * 24, label, fn, 104, 18, color))),
    );
    // ¿Regalo diario sin recoger? Se avisa al lado de MISIONES.
    if (account.profile && account.profile.daily.last !== today()) {
      const gift = this.add.image(VIEW_W / 2 + 1.5 * 112 + 50, 142, 'icon_gift');
      this.tweens.add({ targets: gift, angle: { from: -12, to: 12 }, yoyo: true, repeat: -1, duration: 260 });
    }
    const small: [string, () => void][] = [
      ['CONTROLES', () => fadeTo(this, 'Controls')],
      ['CRÉDITOS', () => fadeTo(this, 'Credits')],
      ['SALIR', () => this.quit()],
    ];
    small.forEach(([label, fn], i) => this.menu.add(new Button(this, VIEW_W / 2 + (i - 1) * 80, 200, label, fn, 72, 14)));
    this.menu.setIndex(1, true);
    if (!IS_TOUCH) text(this, VIEW_W / 2, VIEW_H - 12, 'FLECHAS ELEGIR · ENTER ACEPTAR · F PANTALLA COMPLETA', { color: UI.muted });
    addFullscreenButton(this);
    // Enlace de invitación (?sala=CODIGO): directo a la sala.
    const params = new URLSearchParams(location.search);
    const sala = params.get('sala');
    if (sala) {
      params.delete('sala');
      const rest = params.toString();
      history.replaceState(null, '', location.pathname + (rest ? `?${rest}` : ''));
      this.time.delayedCall(300, () => fadeTo(this, 'Online', { join: sala }));
    }
    // El primer toque o tecla desbloquea el sonido (los navegadores lo exigen).
    this.input.once('pointerdown', () => audio.unlock());
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      if (this.typing) this.stopTyping();
    });
  }

  /** JUGAR: la primera vez, el tutorial de 30 s; luego, elegir modo. */
  private play(): void {
    mobileFullscreen();
    applyFullscreen();
    if (!settings.tutorialDone) fadeTo(this, 'Game', { tutorial: true, next: 'ModeSelect' });
    else fadeTo(this, 'ModeSelect');
  }

  private refreshName(): void {
    const cursor = this.typing && Math.floor(this.t * 3) % 2 ? '_' : this.typing ? ' ' : '';
    this.nameBtn.setText(`TU NOMBRE: ${profile.look.name}${cursor}`);
  }

  private toggleTyping(): void {
    if (this.typing) {
      this.stopTyping();
      return;
    }
    this.typing = true;
    audio.unlock();
    input.startTyping((key, code) => {
      if (code === 'Enter' || code === 'NumpadEnter' || code === 'Escape') {
        this.stopTyping();
        return;
      }
      const look = profile.look;
      if (code === 'Backspace') look.name = look.name.slice(0, -1);
      else if (key.length === 1 && look.name.length < NAME_MAX) look.name = cleanName(look.name + key);
      audio.play('hover');
      this.refreshName();
    }, profile.look.name);
  }

  private stopTyping(): void {
    if (!this.typing) return;
    this.typing = false;
    input.stopTyping();
    input.consume();
    if (!profile.look.name.trim()) profile.look.name = 'JUGADOR';
    saveLook(profile.look);
    audio.play('click');
    this.refreshName();
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
    if (this.typing) {
      this.refreshName();
      return;
    }
    // Rejilla: nombre, JUGAR, dos filas de 4 y una de 3.
    const i = this.menu.index;
    const rowOf = (k: number) => (k <= 1 ? k : k <= 5 ? 2 : k <= 9 ? 3 : 4);
    const rowStart = [0, 1, 2, 6, 10];
    const rowLen = [1, 1, 4, 4, 3];
    const r = rowOf(i);
    const col = i - rowStart[r];
    const go = (nr: number) => {
      const c = rowLen[nr] === 1 ? 0 : rowLen[r] === 1 ? Math.floor((rowLen[nr] - 1) / 2) : Math.min(col, rowLen[nr] - 1);
      this.menu.setIndex(rowStart[nr] + c);
    };
    if (input.nav('down')) go((r + 1) % 5);
    else if (input.nav('up')) go((r + 4) % 5);
    else if (input.nav('left') && rowLen[r] > 1) this.menu.setIndex(rowStart[r] + ((col + rowLen[r] - 1) % rowLen[r]));
    else if (input.nav('right') && rowLen[r] > 1) this.menu.setIndex(rowStart[r] + ((col + 1) % rowLen[r]));
    else if (input.confirm()) {
      this.menu.current?.activate();
      input.consume();
    }
  }
}
