import Phaser from 'phaser';
import { VIEW_W } from '../config/balance';
import { profile } from '../config/profile';
import { audio } from '../core/audio';
import { input } from '../core/input';
import { COS_CATS, COSMETICS, CosCat, CosItem } from '../../shared/economy';
import { dance, drawFrame, hatKey, hatLift, hitBurst, makeTrail } from '../game/cosmetics';
import { CHAR_H, ensureCharTexture } from '../gfx/characters';
import { FONT, fontText } from '../gfx/font';
import { account } from '../net/account';
import { Button, Focusable, Menu, panel, text, UI } from '../ui/widgets';
import { Backdrop, fadeIn, fadeTo } from './common';

/** Fila de un artículo de la tienda. */
class ItemRow extends Phaser.GameObjects.Container implements Focusable {
  private g: Phaser.GameObjects.Graphics;
  private name_: Phaser.GameObjects.BitmapText;
  private price: Phaser.GameObjects.BitmapText;
  private focused = false;
  enabled = true;
  menu?: Menu;

  constructor(scene: Phaser.Scene, x: number, y: number, readonly item: CosItem, private onFocus: () => void, private onPick: () => void) {
    super(scene, x, y);
    this.g = scene.add.graphics();
    this.name_ = scene.add.bitmapText(-120, 0, FONT, fontText(item.name)).setOrigin(0, 0.5);
    this.price = scene.add.bitmapText(120, 0, FONT, '').setOrigin(1, 0.5);
    const sw = scene.add.rectangle(-128, 0, 5, 9, item.color);
    this.add([this.g, sw, this.name_, this.price]);
    this.setSize(260, 15);
    this.setInteractive({ useHandCursor: true });
    this.on('pointerover', () => this.menu?.focusItem(this));
    this.on('pointerup', () => this.activate());
    this.refresh();
    scene.add.existing(this);
  }

  refresh(): void {
    const owned = account.owns(this.item.id);
    const equipped = account.profile?.equipped[this.item.cat] === this.item.id;
    const g = this.g;
    g.clear();
    g.fillStyle(this.focused ? UI.focus : UI.border, 1).fillRect(-132, -7, 264, 14);
    g.fillStyle(this.focused ? UI.panelLight : UI.panel, 1).fillRect(-131, -6, 262, 12);
    this.name_.setTint(this.focused ? UI.focusLight : UI.text);
    const afford = account.lonchas >= this.item.price;
    this.price
      .setText(fontText(equipped ? 'PUESTO' : owned ? 'TUYO' : `${this.item.price} LONCHAS`))
      .setTint(equipped ? UI.green : owned ? 0x7cc8ff : afford ? 0xffd23f : UI.muted);
  }

  setFocused(f: boolean, silent = false): void {
    if (f && !this.focused && !silent) audio.play('hover');
    this.focused = f;
    if (f) this.onFocus();
    this.refresh();
  }

  activate(): void {
    this.onPick();
  }
}

/** Tienda de cosméticos: se paga con lonchas (moneda del juego, solo virtual). */
export class ShopScene extends Phaser.Scene {
  private menu!: Menu;
  private backdrop!: Backdrop;
  private cat: CosCat = 'hat';
  private rows: ItemRow[] = [];
  private tabs: Phaser.GameObjects.BitmapText[] = [];
  private preview!: Phaser.GameObjects.Sprite;
  private hat!: Phaser.GameObjects.Image;
  private emote!: Phaser.GameObjects.Image;
  private frameG!: Phaser.GameObjects.Graphics;
  private nameTag!: Phaser.GameObjects.BitmapText;
  private trail: Phaser.GameObjects.Particles.ParticleEmitter | null = null;
  private stopDance: (() => void) | null = null;
  private current: CosItem | null = null;
  private info!: Phaser.GameObjects.BitmapText;
  private t = 0;
  private fx = 0;
  private busy = false;

  constructor() {
    super('Shop');
  }

  init(data: { cat?: CosCat }): void {
    this.cat = data.cat ?? 'hat';
  }

  create(): void {
    fadeIn(this);
    this.backdrop = new Backdrop(this, false, 0.25);
    text(this, VIEW_W / 2, 12, 'TIENDA', { scale: 2, color: UI.focusLight });
    text(this, VIEW_W / 2, 28, '← → CATEGORÍA · ENTER COMPRAR / PONER · SOLO LONCHAS DEL JUEGO', { color: UI.muted });
    const g = this.add.graphics();
    panel(g, 8, 52, 172, 190, UI.panelDark);
    panel(g, 186, 52, 286, 190);
    this.tabs = COS_CATS.map((c, i) => {
      const t = text(this, 30 + i * 75, 42, c.name, { color: UI.muted });
      t.setInteractive({ useHandCursor: true }).on('pointerup', () => this.setCat(c.id));
      return t;
    });
    // vista previa
    const key = ensureCharTexture(this, null, profile.look);
    this.preview = this.add.sprite(94, 196, key, 'down_idle0').setScale(4).setOrigin(0.5, (CHAR_H - 1) / CHAR_H);
    this.preview.play(`${key}_down_idle`);
    this.hat = this.add.image(94, 196, '__DEFAULT').setOrigin(0.5, 1).setScale(4).setVisible(false);
    this.emote = this.add.image(94, 100, 'emote_jamon').setScale(2).setVisible(false);
    this.frameG = this.add.graphics();
    this.nameTag = text(this, 94, 212, profile.look.name, { color: UI.text });
    this.info = text(this, 94, 230, '', { color: UI.muted });
    this.setCat(this.cat);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.stopDance?.());
    const off = account.onChange(() => this.rows.forEach((r) => r.refresh()));
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, off);
  }

  private setCat(cat: CosCat): void {
    this.cat = cat;
    this.tabs.forEach((t, i) => t.setTint(COS_CATS[i].id === cat ? UI.focusLight : UI.muted));
    for (const r of this.rows) r.destroy();
    this.menu = new Menu();
    const items = COSMETICS.filter((c) => c.cat === cat);
    this.rows = items.map((it, i) => this.menu.add(new ItemRow(this, 329, 66 + i * 16, it, () => this.showPreview(it), () => void this.pick(it))));
    this.menu.add(new Button(this, 329, 230, 'VOLVER', () => fadeTo(this, 'Menu'), 90, 14));
    audio.play('hover');
  }

  private showPreview(it: CosItem): void {
    this.current = it;
    this.stopDance?.();
    this.stopDance = null;
    this.trail?.destroy();
    this.trail = null;
    this.hat.setVisible(false);
    this.emote.setVisible(false);
    this.frameG.clear();
    this.preview.setPosition(94, 196).setAngle(0);
    const key = this.preview.texture.key;
    this.preview.play(`${key}_down_idle`);
    if (it.cat === 'hat') {
      const k = hatKey(it.id);
      if (k) this.hat.setTexture(k).setVisible(true);
    } else if (it.cat === 'trail') {
      this.preview.play(`${key}_side_run`);
      this.trail = makeTrail(this, it.id);
    } else if (it.cat === 'emote') {
      this.emote.setTexture(it.id).setVisible(true);
    } else if (it.cat === 'dance') {
      this.stopDance = dance(this, this.preview, it.id);
    }
    const owned = account.owns(it.id);
    this.info.setText(fontText(owned ? 'YA ES TUYO' : `CUESTA ${it.price} · TIENES ${account.lonchas}`));
  }

  private async pick(it: CosItem): Promise<void> {
    if (this.busy) return;
    this.busy = true;
    if (account.offline || !account.profile) {
      audio.play('denied');
      this.game.events.emit('toast', 'SIN CONEXIÓN CON EL SERVIDOR', UI.red, 'icon_shop');
    } else if (!account.owns(it.id)) {
      const r = await account.buy(it.id);
      if (r?.ok) {
        audio.play('jackpot');
        this.game.events.emit('toast', `¡COMPRADO! ${it.name}`, UI.green, 'icon_shop');
        this.cameras.main.shake(120, 0.004);
        await account.equip(it.cat, it.id);
      } else {
        audio.play('denied');
        this.game.events.emit('toast', r?.why ?? 'NO SE PUDO COMPRAR', UI.red, 'icon_shop');
      }
    } else {
      const on = account.profile.equipped[it.cat] === it.id;
      await account.equip(it.cat, on ? null : it.id);
      audio.play('click');
    }
    this.busy = false;
    this.rows.forEach((r) => r.refresh());
    this.showPreview(it);
  }

  update(_t: number, delta: number): void {
    const dt = delta / 1000;
    this.t += dt;
    this.backdrop.update(dt);
    const it = this.current;
    // efectos animados de la vista previa
    if (it?.cat === 'hat' && this.hat.visible) {
      const bob = Math.sin(this.t * 2.5) > 0 ? 0 : 4;
      this.hat.setPosition(94, 196 - 4 * 15 + bob - hatLift(it.id) * 4);
    }
    if (it?.cat === 'emote') this.emote.setY(100 + Math.sin(this.t * 4) * 4);
    if (it?.cat === 'frame') drawFrame(this.frameG, 94, 212, this.nameTag.width, it.id, this.t);
    if (this.trail) this.trail.emitParticleAt(94 - 20 + Math.random() * 6, 186 + Math.random() * 10, 1);
    if (it?.cat === 'hit') {
      this.fx -= dt;
      if (this.fx <= 0) {
        this.fx = 0.9;
        hitBurst(this, 120, 150, it.id);
        this.cameras.main.shake(60, 0.002);
      }
    }
    if (input.back()) {
      audio.play('back');
      fadeTo(this, 'Menu');
      return;
    }
    const left = input.nav('left');
    const right = !left && input.nav('right');
    if (left || right) {
      const i = COS_CATS.findIndex((c) => c.id === this.cat);
      this.setCat(COS_CATS[(i + (left ? -1 : 1) + COS_CATS.length) % COS_CATS.length].id);
      return;
    }
    this.menu.update();
  }
}
