import Phaser from 'phaser';
import { VIEW_H, VIEW_W } from '../config/balance';
import { Action, ACTION_LABELS, ACTIONS, keyName, resetBindings, saveSettings, settings } from '../config/settings';
import { audio } from '../core/audio';
import { input } from '../core/input';
import { FONT, fontText } from '../gfx/font';
import { Button, Focusable, Menu, text, UI } from '../ui/widgets';
import { Backdrop, fadeIn, fadeTo } from './common';

class KeyRow extends Phaser.GameObjects.Container implements Focusable {
  private g: Phaser.GameObjects.Graphics;
  private label: Phaser.GameObjects.BitmapText;
  private value: Phaser.GameObjects.BitmapText;
  private focused = false;
  waiting = false;
  enabled = true;
  menu?: Menu;
  private readonly bw = 240;

  constructor(scene: Phaser.Scene, x: number, y: number, readonly action: Action, private onStart: (row: KeyRow) => void) {
    super(scene, x, y);
    this.g = scene.add.graphics();
    this.label = scene.add.bitmapText(-this.bw / 2 + 8, 0, FONT, fontText(ACTION_LABELS[action])).setOrigin(0, 0.5);
    this.value = scene.add.bitmapText(this.bw / 2 - 8, 0, FONT, '').setOrigin(1, 0.5);
    this.add([this.g, this.label, this.value]);
    this.setSize(this.bw, 14);
    this.setInteractive({ useHandCursor: true });
    this.on('pointerover', () => this.menu?.focusItem(this));
    this.on('pointerup', () => this.activate());
    scene.add.existing(this);
    this.refresh();
  }

  setFocused(f: boolean, silent = false): void {
    if (f && !this.focused && !silent) audio.play('hover');
    this.focused = f;
    this.refresh();
  }

  activate(): void {
    audio.play('click');
    this.onStart(this);
  }

  refresh(blink = true): void {
    const w = this.bw;
    const g = this.g;
    g.clear();
    g.fillStyle(this.waiting ? 0x63c74d : this.focused ? UI.focus : UI.border, 1).fillRect(-w / 2, -7, w, 14);
    g.fillStyle(this.focused ? UI.panelLight : UI.panel, 1).fillRect(-w / 2 + 1, -6, w - 2, 12);
    const c = this.focused ? UI.focusLight : UI.text;
    this.label.setTint(c);
    if (this.waiting) {
      this.value.setText(blink ? fontText('PULSA UNA TECLA...') : '').setTint(0x63c74d);
    } else {
      this.value.setText(fontText(keyName(settings.bindings[this.action]))).setTint(c);
    }
  }
}

export class ControlsScene extends Phaser.Scene {
  private menu!: Menu;
  private rows: KeyRow[] = [];
  private capturing: KeyRow | null = null;
  private backdrop!: Backdrop;
  private msg!: Phaser.GameObjects.BitmapText;
  private t = 0;

  constructor() {
    super('Controls');
  }

  create(): void {
    fadeIn(this);
    this.capturing = null;
    this.backdrop = new Backdrop(this, false);
    text(this, VIEW_W / 2, 14, 'CONTROLES', { scale: 2, color: UI.focusLight });
    text(this, VIEW_W / 2, 30, 'ELIGE UNA ACCIÓN Y PULSA ENTER PARA CAMBIAR SU TECLA', { color: UI.muted });
    this.menu = new Menu();
    this.rows = ACTIONS.map((a, i) => this.menu.add(new KeyRow(this, VIEW_W / 2, 44 + i * 15, a, (r) => this.startCapture(r))));
    const by = 44 + ACTIONS.length * 15 + 4;
    this.menu.add(new Button(this, VIEW_W / 2 - 52, by, 'RESTABLECER', () => {
      resetBindings();
      this.rows.forEach((r) => r.refresh());
      this.say('TECLAS POR DEFECTO RESTAURADAS', UI.green);
    }, 96, 15));
    this.menu.add(new Button(this, VIEW_W / 2 + 52, by, 'VOLVER', () => this.back(), 96, 15));
    this.msg = text(this, VIEW_W / 2, by + 18, '', { color: UI.green });
    text(this, VIEW_W / 2, VIEW_H - 24, 'LAS FLECHAS SIEMPRE MUEVEN · SHIFT DERECHO TAMBIÉN ES SPRINT', { color: UI.muted });
    text(this, VIEW_W / 2, VIEW_H - 12, 'MANDO: A GOLPE · X HABILIDAD · Y GIRAR · LT RULETA · RB SPRINT · SELECT FRASES', { color: UI.muted });
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => input.cancelCapture());
  }

  private say(s: string, color: number): void {
    this.msg.setText(fontText(s)).setTint(color).setAlpha(1);
    this.tweens.killTweensOf(this.msg);
    this.tweens.add({ targets: this.msg, alpha: 0, delay: 1800, duration: 400 });
  }

  private startCapture(row: KeyRow): void {
    if (this.capturing) {
      this.capturing.waiting = false;
      this.capturing.refresh();
    }
    this.capturing = row;
    row.waiting = true;
    row.refresh();
    input.captureNextKey((code) => {
      this.time.delayedCall(0, () => this.finishCapture(row, code));
    });
  }

  private finishCapture(row: KeyRow, code: string): void {
    row.waiting = false;
    this.capturing = null;
    if (code === 'Escape' && row.action !== 'pause') {
      audio.play('back');
      this.say('CANCELADO', UI.muted);
      row.refresh();
      input.consume();
      return;
    }
    const b = settings.bindings;
    const old = b[row.action];
    const other = ACTIONS.find((a) => a !== row.action && b[a] === code);
    b[row.action] = code;
    if (other) {
      b[other] = old;
      this.say(`${ACTION_LABELS[other]} PASA A ${keyName(old)}`, UI.focus);
    } else {
      this.say(`${keyName(code)} ASIGNADA`, UI.green);
    }
    saveSettings();
    audio.play('click');
    this.rows.forEach((r) => r.refresh());
    input.consume();
  }

  private back(): void {
    input.cancelCapture();
    fadeTo(this, 'Menu');
  }

  update(_t: number, delta: number): void {
    const dt = delta / 1000;
    this.t += dt;
    this.backdrop.update(dt);
    if (this.capturing) {
      this.capturing.refresh(Math.floor(this.t * 3) % 2 === 0);
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
