import Phaser from 'phaser';
import { VIEW_W } from '../config/balance';
import { profile, saveLook } from '../config/profile';
import { audio } from '../core/audio';
import { input } from '../core/input';
import { EXTRAS, GLASSES, HAIR_COLORS, HAIR_STYLES, HATS, Look, LOOK_COLORS, LOOK_LIMITS, NAME_MAX, randomLook, SKIN_TONES, cleanName } from '../../shared/look';
import { ensureCharTexture, Outfit } from '../gfx/characters';
import { hexToInt } from '../gfx/palette';
import { Button, Menu, OptionRow, panel, text, UI } from '../ui/widgets';
import { Backdrop, fadeIn, fadeTo } from './common';
import { net } from '../net/NetClient';

type Field = Exclude<keyof Look, 'name'>;

const DIRS = ['down', 'side', 'up'] as const;

/** "Mi personaje": nombre, color, piel, peinado, sombrero, gafas y extra. */
/** Atuendos que te puedes probar (en partida dependen del modo, el equipo y la ciudad). */
const OUTFIT_NAMES: Record<Outfit, string> = {
  casual: 'TU ROPA',
  guchi: 'ROJO GUCHI',
  blue: 'AZUL',
  police: 'POLICÍA (PARÍS Y LAS VEGAS)',
  military: 'MILITAR',
  street: 'CALLE (BCN)',
  zombie: 'ZOMBI',
};

export class CharacterScene extends Phaser.Scene {
  private look!: Look;
  private menu!: Menu;
  private backdrop!: Backdrop;
  private preview!: Phaser.GameObjects.Sprite;
  private ham!: Phaser.GameObjects.Image;
  private uniform: Outfit = 'casual';
  private dirIdx = 0;
  private dirTimer = 0;
  private typing = false;
  private nameRow!: OptionRow;
  private backTo = 'Menu';
  private t = 0;
  private colorSwatch!: Phaser.GameObjects.Graphics;

  constructor() {
    super('Character');
  }

  init(data: { back?: string }): void {
    this.backTo = data.back ?? 'Menu';
    this.look = { ...profile.look };
    this.uniform = 'casual';
    this.typing = false;
    this.dirIdx = 0;
  }

  create(): void {
    fadeIn(this);
    this.backdrop = new Backdrop(this, false);
    text(this, VIEW_W / 2, 12, 'MI PERSONAJE', { scale: 2, color: UI.focusLight });

    // vista previa
    const g = this.add.graphics();
    panel(g, 14, 32, 140, 196, 0x3a3054);
    this.colorSwatch = this.add.graphics();
    this.add.image(84, 196, 'shadow').setScale(5, 3).setAlpha(0.3);
    this.preview = this.add.sprite(84, 200, ensureCharTexture(this, null, this.look), 'down_idle0').setScale(5).setOrigin(0.5, 19 / 20);
    this.ham = this.add.image(84 + 25, 180, 'ham').setScale(5).setOrigin(2 / 15, 4.5 / 9).setRotation(-1.15).setVisible(false);
    text(this, 84, 214, 'VISTA PREVIA', { color: UI.muted });

    // opciones
    this.menu = new Menu();
    const x = 318;
    let y = 36;
    const W = 300;
    const step = 17;
    this.nameRow = this.menu.add(
      new OptionRow(this, x, y, 'NOMBRE', () => (this.typing ? `${this.look.name}${Math.floor(this.t * 3) % 2 ? '_' : ' '}` : this.look.name), () => this.startTyping(), W, () => this.startTyping(), 118),
    );
    y += step;
    const opt = (label: string, field: Field, names: string[]) => {
      this.menu.add(
        new OptionRow(this, x, y, label, () => names[this.look[field]] ?? '', (d) => this.change(field, d), W, undefined, 118),
      );
      y += step;
    };
    opt('COLOR', 'color', LOOK_COLORS.map((c) => c.name));
    opt('PIEL', 'skin', SKIN_TONES.map((c) => c.name));
    opt('PEINADO', 'hair', HAIR_STYLES);
    opt('COLOR DE PELO', 'hairColor', HAIR_COLORS.map((c) => c.name));
    opt('SOMBRERO', 'hat', HATS);
    opt('GAFAS', 'glasses', GLASSES);
    opt('EXTRA', 'extra', EXTRAS);
    this.menu.add(
      new OptionRow(
        this,
        x,
        y,
        'PROBAR UNIFORME',
        () => OUTFIT_NAMES[this.uniform],
        (d) => {
          const order = Object.keys(OUTFIT_NAMES) as Outfit[];
          this.uniform = order[(order.indexOf(this.uniform) + d + order.length) % order.length];
          this.refresh();
        },
        W,
        undefined,
        118,
      ),
    );
    y += step + 6;
    this.menu.add(new Button(this, x - 76, y, 'ALEATORIO', () => this.randomize(), 120, 16));
    this.menu.add(new Button(this, x + 76, y, 'GUARDAR', () => this.save(), 120, 16, UI.green));
    text(this, x, y + 20, 'ENTER EN NOMBRE PARA ESCRIBIR · ESC VOLVER', { color: UI.muted });
    text(this, x, y + 30, 'EN PARTIDA LLEVARÁS EL UNIFORME DE TU EQUIPO', { color: UI.muted });
    this.refresh();
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => input.stopTyping());
  }

  private change(field: Field, d: number): void {
    const n = LOOK_LIMITS[field];
    this.look[field] = (this.look[field] + d + n) % n;
    this.refresh();
  }

  private randomize(): void {
    const name = this.look.name;
    this.look = { ...randomLook(name), skin: Math.floor(Math.random() * SKIN_TONES.length) };
    this.refresh();
    this.children.list.forEach((c) => {
      if (c instanceof OptionRow) c.refresh();
    });
  }

  private refresh(): void {
    const team = this.uniform === 'guchi' ? 'escapist' : this.uniform === 'casual' ? null : 'chaser';
    const key = ensureCharTexture(this, team, this.look, this.uniform);
    const dir = DIRS[this.dirIdx];
    this.preview.setTexture(key, `${dir}_idle0`);
    this.preview.play(`${key}_${dir}_idle`);
    this.ham.setVisible(['blue', 'police', 'military', 'street'].includes(this.uniform) && dir !== 'up');
    this.colorSwatch.clear();
    this.colorSwatch.fillStyle(0x0d0b14, 1).fillRect(20, 38, 12, 12);
    this.colorSwatch.fillStyle(hexToInt(LOOK_COLORS[this.look.color].hex), 1).fillRect(21, 39, 10, 10);
  }

  private startTyping(): void {
    if (this.typing) {
      this.stopTyping();
      return;
    }
    this.typing = true;
    audio.play('click');
    input.startTyping((key, code) => {
      if (code === 'Enter' || code === 'NumpadEnter' || code === 'Escape') {
        this.stopTyping();
        return;
      }
      if (code === 'Backspace') this.look.name = this.look.name.slice(0, -1);
      else if (key.length === 1 && this.look.name.length < NAME_MAX) this.look.name = cleanName(this.look.name + key);
      audio.play('hover');
      this.nameRow.refresh();
    }, this.look.name);
  }

  private stopTyping(): void {
    this.typing = false;
    input.stopTyping();
    input.consume();
    if (!this.look.name.trim()) this.look.name = 'JUGADOR';
    audio.play('click');
    this.nameRow.refresh();
  }

  private save(): void {
    if (this.typing) this.stopTyping();
    saveLook(this.look);
    if (net.connected) net.setLook(profile.look); // los demás de la sala lo ven al momento
    fadeTo(this, this.backTo);
  }

  update(_t: number, delta: number): void {
    const dt = delta / 1000;
    this.t += dt;
    this.backdrop.update(dt);
    // la vista previa va girando sola
    this.dirTimer += dt;
    if (this.dirTimer > 1.6) {
      this.dirTimer = 0;
      this.dirIdx = (this.dirIdx + 1) % DIRS.length;
      this.refresh();
    }
    if (this.typing) {
      this.nameRow.refresh();
      return;
    }
    if (input.back()) {
      audio.play('back');
      saveLook(this.look);
      if (net.connected) net.setLook(profile.look);
      fadeTo(this, this.backTo);
      return;
    }
    this.menu.update();
  }
}
