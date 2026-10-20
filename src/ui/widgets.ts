import Phaser from 'phaser';
import { audio } from '../core/audio';
import { input } from '../core/input';
import { FONT, fontText } from '../gfx/font';

export const UI = {
  panel: 0x2a2140,
  panelDark: 0x1a1428,
  panelLight: 0x3d3160,
  border: 0x0d0b14,
  focus: 0xfeae34,
  focusLight: 0xfee761,
  text: 0xf4f0e8,
  muted: 0x8b9bb4,
  red: 0xe43b44,
  blue: 0x2f88e8,
  green: 0x63c74d,
};

export function text(
  scene: Phaser.Scene,
  x: number,
  y: number,
  s: string,
  opts: { color?: number; scale?: number; origin?: [number, number]; align?: 'left' | 'center' | 'right'; depth?: number } = {},
): Phaser.GameObjects.BitmapText {
  const t = scene.add.bitmapText(Math.round(x), Math.round(y), FONT, fontText(s));
  t.setOrigin(...(opts.origin ?? [0.5, 0.5]));
  if (opts.scale) t.setScale(opts.scale);
  t.setTint(opts.color ?? UI.text);
  if (opts.align === 'center') t.setCenterAlign();
  else if (opts.align === 'right') t.setRightAlign();
  if (opts.depth !== undefined) t.setDepth(opts.depth);
  return t;
}

/** Panel pixel con borde y sombra. */
export function panel(g: Phaser.GameObjects.Graphics, x: number, y: number, w: number, h: number, fill = UI.panel, border = UI.border, shadow = true): void {
  if (shadow) {
    g.fillStyle(0x000000, 0.35);
    g.fillRect(x + 2, y + 2, w, h);
  }
  g.fillStyle(border, 1);
  g.fillRect(x, y, w, h);
  g.fillStyle(fill, 1);
  g.fillRect(x + 1, y + 1, w - 2, h - 2);
  g.fillStyle(0xffffff, 0.08);
  g.fillRect(x + 1, y + 1, w - 2, 1);
}

export interface Focusable {
  setFocused(f: boolean, silent?: boolean): void;
  activate(): void;
  adjust?(dir: number): void;
  enabled: boolean;
}

/** Botón con estados normal / foco (hover) / pulsado. */
export class Button extends Phaser.GameObjects.Container implements Focusable {
  private g: Phaser.GameObjects.Graphics;
  private label: Phaser.GameObjects.BitmapText;
  private focused = false;
  private pressed = false;
  enabled = true;
  onFocus?: () => void;

  constructor(
    scene: Phaser.Scene,
    x: number,
    y: number,
    labelText: string,
    private onClick: () => void,
    private bw = 110,
    private bh = 17,
    private accent = UI.focus,
  ) {
    super(scene, Math.round(x), Math.round(y));
    this.g = scene.add.graphics();
    this.label = scene.add.bitmapText(0, 0, FONT, fontText(labelText)).setOrigin(0.5, 0.5);
    this.add([this.g, this.label]);
    this.setSize(bw, bh);
    this.setInteractive({ useHandCursor: true });
    this.on('pointerover', () => {
      if (!this.enabled) return;
      this.menu?.focusItem(this);
    });
    this.on('pointerdown', () => {
      if (!this.enabled) return;
      this.pressed = true;
      this.redraw();
    });
    this.on('pointerout', () => {
      this.pressed = false;
      this.redraw();
    });
    this.on('pointerup', () => {
      if (!this.enabled || !this.pressed) return;
      this.pressed = false;
      this.activate();
    });
    this.redraw();
    scene.add.existing(this);
  }

  menu?: Menu;

  setText(s: string): this {
    this.label.setText(fontText(s));
    return this;
  }

  setEnabled(e: boolean): this {
    this.enabled = e;
    this.redraw();
    return this;
  }

  setFocused(f: boolean, silent = false): void {
    if (f && !this.focused && !silent) audio.play('hover');
    this.focused = f;
    if (f) this.onFocus?.();
    this.redraw();
  }

  activate(): void {
    if (!this.enabled) {
      audio.play('denied');
      return;
    }
    audio.play('click');
    this.pressed = true;
    this.redraw();
    this.scene.time.delayedCall(90, () => {
      this.pressed = false;
      if (this.active) this.redraw();
    });
    this.onClick();
  }

  private redraw(): void {
    const g = this.g;
    const w = this.bw;
    const h = this.bh;
    const x = -w / 2;
    const y = -h / 2;
    g.clear();
    const dy = this.pressed ? 1 : 0;
    // sombra/base
    g.fillStyle(UI.border, 1).fillRect(x, y + 2, w, h);
    const fill = !this.enabled ? 0x2a2633 : this.pressed ? UI.panelDark : this.focused ? UI.panelLight : UI.panel;
    g.fillStyle(this.focused && this.enabled ? this.accent : UI.border, 1).fillRect(x, y + dy, w, h);
    g.fillStyle(fill, 1).fillRect(x + 1, y + 1 + dy, w - 2, h - 2);
    if (!this.pressed) {
      g.fillStyle(0xffffff, this.focused ? 0.18 : 0.08).fillRect(x + 1, y + 1, w - 2, 1);
    }
    if (this.focused && this.enabled) {
      // flechitas laterales
      g.fillStyle(this.accent, 1);
      g.fillRect(x - 5, y + h / 2 - 2 + dy, 2, 4);
      g.fillRect(x - 3, y + h / 2 - 1 + dy, 1, 2);
      g.fillRect(x + w + 3, y + h / 2 - 2 + dy, 2, 4);
      g.fillRect(x + w + 2, y + h / 2 - 1 + dy, 1, 2);
    }
    this.label.setY(dy);
    this.label.setTint(!this.enabled ? 0x6a6478 : this.focused ? UI.focusLight : UI.text);
  }
}

/** Fila de opción con valor ajustable (izquierda / derecha). */
export class OptionRow extends Phaser.GameObjects.Container implements Focusable {
  private g: Phaser.GameObjects.Graphics;
  private label: Phaser.GameObjects.BitmapText;
  private value: Phaser.GameObjects.BitmapText;
  private left: Phaser.GameObjects.BitmapText;
  private right: Phaser.GameObjects.BitmapText;
  private focused = false;
  enabled = true;
  menu?: Menu;

  constructor(
    scene: Phaser.Scene,
    x: number,
    y: number,
    labelText: string,
    private getValue: () => string,
    private change: (dir: number) => void,
    private bw = 260,
    private onActivate?: () => void,
    private valueW = 84,
  ) {
    super(scene, Math.round(x), Math.round(y));
    const h = 15;
    this.g = scene.add.graphics();
    this.label = scene.add.bitmapText(-bw / 2 + 8, 0, FONT, fontText(labelText)).setOrigin(0, 0.5);
    this.value = scene.add.bitmapText(bw / 2 - 14 - valueW / 2, 0, FONT, '').setOrigin(0.5, 0.5);
    this.left = scene.add.bitmapText(bw / 2 - 20 - valueW, 0, FONT, '←').setOrigin(0.5, 0.5);
    this.right = scene.add.bitmapText(bw / 2 - 8, 0, FONT, '→').setOrigin(0.5, 0.5);
    this.add([this.g, this.label, this.value, this.left, this.right]);
    this.setSize(bw, h);
    this.setInteractive({ useHandCursor: true });
    this.on('pointerover', () => this.menu?.focusItem(this));
    this.on('pointerup', (p: Phaser.Input.Pointer) => {
      const lx = p.worldX - this.x;
      if (this.onActivate && lx < this.bw / 2 - 26 - this.valueW) {
        this.activate();
        return;
      }
      this.adjust(lx < this.bw / 2 - 14 - this.valueW / 2 ? -1 : 1);
    });
    this.refresh();
    scene.add.existing(this);
  }

  setFocused(f: boolean, silent = false): void {
    if (f && !this.focused && !silent) audio.play('hover');
    this.focused = f;
    this.refresh();
  }

  activate(): void {
    if (this.onActivate) {
      audio.play('click');
      this.onActivate();
      this.refresh();
    } else this.adjust(1);
  }

  adjust(dir: number): void {
    audio.play('click');
    this.change(dir);
    this.refresh();
  }

  refresh(): void {
    const g = this.g;
    const w = this.bw;
    const h = 15;
    g.clear();
    g.fillStyle(this.focused ? UI.focus : UI.border, 1).fillRect(-w / 2, -h / 2, w, h);
    g.fillStyle(this.focused ? UI.panelLight : UI.panel, 1).fillRect(-w / 2 + 1, -h / 2 + 1, w - 2, h - 2);
    this.value.setText(fontText(this.getValue()));
    const c = this.focused ? UI.focusLight : UI.text;
    this.label.setTint(c);
    this.value.setTint(c);
    this.left.setTint(this.focused ? UI.focus : UI.muted);
    this.right.setTint(this.focused ? UI.focus : UI.muted);
  }
}

/** Lista navegable de elementos (teclado, mando y ratón). */
export class Menu {
  index = 0;
  private items: Focusable[] = [];

  constructor(private horizontal = false) {}

  add<T extends Focusable>(item: T): T {
    this.items.push(item);
    (item as unknown as { menu?: Menu }).menu = this;
    if (this.items.length === 1) item.setFocused(true, true);
    return item;
  }

  focusItem(item: Focusable): void {
    const i = this.items.indexOf(item);
    if (i >= 0 && i !== this.index) this.setIndex(i);
  }

  setIndex(i: number, silent = false): void {
    if (!this.items.length) return;
    this.items[this.index]?.setFocused(false, true);
    this.index = (i + this.items.length) % this.items.length;
    this.items[this.index].setFocused(true, silent);
  }

  get current(): Focusable | undefined {
    return this.items[this.index];
  }

  /** Procesa la entrada. Devuelve true si se ha consumido algo. */
  update(): boolean {
    if (!this.items.length) return false;
    const prev = this.horizontal ? 'left' : 'up';
    const next = this.horizontal ? 'right' : 'down';
    if (input.nav(prev)) {
      this.step(-1);
      return true;
    }
    if (input.nav(next)) {
      this.step(1);
      return true;
    }
    const cur = this.items[this.index];
    if (!this.horizontal && cur.adjust) {
      if (input.nav('left')) {
        cur.adjust(-1);
        return true;
      }
      if (input.nav('right')) {
        cur.adjust(1);
        return true;
      }
    }
    if (input.confirm()) {
      cur.activate();
      input.consume();
      return true;
    }
    return false;
  }

  private step(d: number): void {
    let i = this.index;
    for (let k = 0; k < this.items.length; k++) {
      i = (i + d + this.items.length) % this.items.length;
      if (this.items[i].enabled) break;
    }
    this.setIndex(i);
  }
}
