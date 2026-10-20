import Phaser from 'phaser';
import { VIEW_H, VIEW_W } from '../config/balance';
import { audio } from '../core/audio';
import { input } from '../core/input';
import { validCode } from '../../shared/protocol';
import { fontText } from '../gfx/font';
import { net } from '../net/NetClient';
import { Button, Menu, OptionRow, text, UI } from '../ui/widgets';
import { addFullscreenButton, Backdrop, fadeIn, fadeTo } from './common';

/** Menú online: partida rápida, crear sala o unirse con un código. */
export class OnlineScene extends Phaser.Scene {
  private menu!: Menu;
  private backdrop!: Backdrop;
  private status!: Phaser.GameObjects.BitmapText;
  private codeRow!: OptionRow;
  private code = '';
  private typing = false;
  private busy = false;
  private autoJoin = '';
  private t = 0;

  constructor() {
    super('Online');
  }

  init(data: { join?: string }): void {
    this.autoJoin = (data.join ?? '').toUpperCase();
    this.code = this.autoJoin;
    this.typing = false;
    this.busy = false;
  }

  create(): void {
    fadeIn(this);
    this.backdrop = new Backdrop(this, true);
    addFullscreenButton(this);
    text(this, VIEW_W / 2, 22, 'JUGAR ONLINE', { scale: 2, color: UI.focusLight });
    text(this, VIEW_W / 2, 40, 'HASTA 20 JUGADORES · 1 AZUL POR CADA 3 ROJOS', { color: UI.muted });
    this.menu = new Menu();
    this.menu.add(new Button(this, VIEW_W / 2, 70, 'PARTIDA RÁPIDA', () => void this.quick(), 170, 18, UI.green));
    this.menu.add(new Button(this, VIEW_W / 2, 94, 'CREAR SALA PRIVADA', () => void this.create_(), 170, 18));
    this.codeRow = this.menu.add(
      new OptionRow(
        this,
        VIEW_W / 2,
        118,
        'UNIRSE CON CÓDIGO',
        () => (this.typing ? this.code.padEnd(5, '_').slice(0, 5) + (Math.floor(this.t * 3) % 2 ? '' : ' ') : this.code || 'ESCRIBIR'),
        () => this.startTyping(),
        250,
        () => this.startTyping(),
        84,
      ),
    );
    this.menu.add(new Button(this, VIEW_W / 2, 142, 'ENTRAR', () => this.join(), 170, 18));
    this.menu.add(new Button(this, VIEW_W / 2, 166, 'MI PERSONAJE', () => fadeTo(this, 'Character', { back: 'Online' }), 170, 18));
    this.menu.add(new Button(this, VIEW_W / 2, 190, 'VOLVER', () => this.back(), 170, 18));
    this.status = text(this, VIEW_W / 2, VIEW_H - 46, '', { color: UI.focus });
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => input.stopTyping());
    if (this.autoJoin && validCode(this.autoJoin)) this.time.delayedCall(250, () => this.join());
  }

  private say(s: string, color: number = UI.focus): void {
    this.status.setText(fontText(s)).setTint(color);
  }

  private async quick(): Promise<void> {
    if (this.busy) return;
    this.busy = true;
    this.say('BUSCANDO SALA...');
    try {
      const code = await net.quickCode();
      net.connect(code, true);
      fadeTo(this, 'Lobby');
    } catch {
      this.say('NO SE PUDO CONECTAR CON EL SERVIDOR', UI.red);
      this.busy = false;
    }
  }

  private async create_(): Promise<void> {
    if (this.busy) return;
    this.busy = true;
    this.say('CREANDO SALA...');
    try {
      const code = await net.newCode();
      net.connect(code, false);
      fadeTo(this, 'Lobby');
    } catch {
      this.say('NO SE PUDO CONECTAR CON EL SERVIDOR', UI.red);
      this.busy = false;
    }
  }

  private join(): void {
    if (this.typing) this.stopTyping();
    if (!validCode(this.code)) {
      audio.play('denied');
      this.say('EL CÓDIGO TIENE 5 LETRAS', UI.red);
      return;
    }
    net.connect(this.code, false);
    fadeTo(this, 'Lobby');
  }

  private startTyping(): void {
    if (this.typing) {
      this.stopTyping();
      return;
    }
    this.typing = true;
    this.code = '';
    input.startTyping((key, code) => {
      if (code === 'Enter' || code === 'NumpadEnter') {
        this.stopTyping();
        if (this.code.length === 5) this.join();
        return;
      }
      if (code === 'Escape') {
        this.stopTyping();
        return;
      }
      if (code === 'Backspace') this.code = this.code.slice(0, -1);
      else if (/^[a-zA-Z]$/.test(key) && this.code.length < 5) this.code += key.toUpperCase();
      audio.play('hover');
      this.codeRow.refresh();
    });
  }

  private stopTyping(): void {
    this.typing = false;
    input.stopTyping();
    input.consume();
    this.codeRow.refresh();
  }

  private back(): void {
    net.leave();
    fadeTo(this, 'Menu');
  }

  update(_t: number, delta: number): void {
    const dt = delta / 1000;
    this.t += dt;
    this.backdrop.update(dt);
    if (this.typing) {
      this.codeRow.refresh();
      return;
    }
    if (input.back()) {
      audio.play('back');
      this.back();
      return;
    }
    this.menu.update();
  }
}
