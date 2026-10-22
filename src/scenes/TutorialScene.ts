import Phaser from 'phaser';
import { VIEW_H, VIEW_W } from '../config/balance';
import { profile } from '../config/profile';
import { audio } from '../core/audio';
import { input } from '../core/input';
import { randomLook } from '../../shared/look';
import { modeInfo } from '../../shared/modes/rules';
import type { ModeId } from '../../shared/sim/types';
import { charKey, ensureCharTexture } from '../gfx/characters';
import { FONT } from '../gfx/font';
import { Button, Menu, panel, text, UI } from '../ui/widgets';
import { keyName, settings } from '../config/settings';
import { IS_TOUCH } from '../core/touch';
import { Backdrop, fadeIn, fadeTo } from './common';
import { MODE_COLORS, wrapWords } from './ModeSelectScene';

const PW = 108;
/** Cómo jugar: 3 frases cortas por modo (caben en la tarjeta). */
const HOWTO: Record<ModeId, string[]> = {
  pilla: ['ROJOS: HUID.', 'AZULES: PILLAD.', 'RESCATA AMIGOS.'],
  infeccion: ['EMPIEZA UN ZOMBI.', 'SI TE TOCA, CAES.', 'SÉ EL ÚLTIMO.'],
  bomba: ['PASA EL JAMÓN.', 'SI EXPLOTA: FUERA', 'GANA EL ÚLTIMO.'],
  escondite: ['HAZTE UN OBJETO.', 'NO TE MUEVAS.', 'QUE NO TE PILLEN.'],
};
const PH = 128;

/** Tutorial rápido de cada modo: 4 viñetas con dibujos animados. */
export class TutorialScene extends Phaser.Scene {
  private mode: ModeId = 'pilla';
  private backdrop!: Backdrop;
  private t = 0;
  private prompt!: Phaser.GameObjects.BitmapText;

  constructor() {
    super('Tutorial');
  }

  /** "Cómo jugar": una tarjeta por modo (en vez de las 4 viñetas de un modo). */
  private howto = false;
  private tapped = false;
  private menu: Menu | null = null;

  init(data: { mode?: ModeId; howto?: boolean }): void {
    this.mode = data.mode ?? 'pilla';
    this.howto = !!data.howto;
    this.t = 0;
    this.tapped = false;
    this.menu = null;
  }

  create(): void {
    fadeIn(this);
    this.backdrop = new Backdrop(this, false, 0.3);
    if (this.howto) {
      this.createHowto();
      return;
    }
    this.input.on('pointerdown', () => (this.tapped = true));
    const info = modeInfo(this.mode);
    const accent = MODE_COLORS[this.mode];
    const title = text(this, VIEW_W / 2 + 10, 16, info.name, { scale: 2, color: accent });
    this.add.image(title.x - title.width / 2 - 14, 16, `mode_${this.mode}`);
    text(this, VIEW_W / 2, 34, info.tagline, { color: UI.text });
    info.tutorial.forEach((step, i) => {
      const x = VIEW_W / 2 + (i - 1.5) * (PW + 8);
      const y = 118;
      const g = this.add.graphics();
      panel(g, x - PW / 2, y - PH / 2, PW, PH);
      g.fillStyle(accent, 1).fillRect(x - PW / 2 + 1, y - PH / 2 + 1, PW - 2, 2);
      g.fillStyle(0x0d0b14, 1).fillRect(x - PW / 2 + 6, y - PH / 2 + 18, PW - 12, 64);
      text(this, x - PW / 2 + 8, y - PH / 2 + 10, `${i + 1}`, { origin: [0, 0.5], color: accent });
      text(this, x + 4, y - PH / 2 + 10, step.title, { color: accent });
      wrapWords(step.lines.join(' '), 18)
        .slice(0, 3)
        .forEach((l, k) => text(this, x, y + 26 + k * 10, l, { color: UI.text }));
      const c = this.add.container(x, y - PH / 2 + 52);
      this.drawStep(c, i);

      // aparecen una a una
      c.setScale(0);
      this.tweens.add({ targets: c, scale: 1.3, delay: 150 + i * 160, duration: 260, ease: 'Back.easeOut', onStart: () => audio.play('hover') });
    });
    this.prompt = text(this, VIEW_W / 2, VIEW_H - 14, IS_TOUCH ? 'TOCA PARA SEGUIR' : 'ENTER / ESPACIO: ¡ENTENDIDO!  ·  ESC: VOLVER', { color: 0xffffff });
  }

  /** CÓMO JUGAR: los 4 modos, cada uno con su dibujo, 3 frases y los controles de tu dispositivo. */
  private createHowto(): void {
    text(this, VIEW_W / 2, 14, 'CÓMO JUGAR', { scale: 2, color: UI.focusLight });
    const modes: ModeId[] = ['pilla', 'infeccion', 'bomba', 'escondite'];
    modes.forEach((m, i) => {
      const info = modeInfo(m);
      const accent = MODE_COLORS[m];
      const x = VIEW_W / 2 + (i - 1.5) * (PW + 8);
      const y = 112;
      const g = this.add.graphics();
      panel(g, x - PW / 2, y - PH / 2, PW, PH);
      g.fillStyle(accent, 1).fillRect(x - PW / 2 + 1, y - PH / 2 + 1, PW - 2, 2);
      g.fillStyle(0x0d0b14, 1).fillRect(x - PW / 2 + 6, y - PH / 2 + 18, PW - 12, 64);
      text(this, x, y - PH / 2 + 10, info.name.replace(' JAMONERO', ''), { color: accent });
      HOWTO[m].forEach((l, k) => text(this, x, y + 26 + k * 10, l, { color: UI.text }));
      const c = this.add.container(x, y - PH / 2 + 52);
      const keep = this.mode;
      this.mode = m;
      this.drawStep(c, 0);
      this.mode = keep;
      c.setScale(0);
      this.tweens.add({ targets: c, scale: 1.3, delay: 150 + i * 160, duration: 260, ease: 'Back.easeOut' });
    });
    const b = settings.bindings;
    const K = (k: string) => keyName(k);
    const ctrl = IS_TOUCH
      ? 'MOVER: JOYSTICK (IZQUIERDA) · BOTONES A LA DERECHA'
      : input.lastDevice === 'gamepad'
        ? 'MOVER: STICK · A: ACCIÓN · X: HABILIDAD · RB: SPRINT'
        : `MOVER: ${K(b.up)}${K(b.left)}${K(b.down)}${K(b.right)} · ACCIÓN: ${K(b.action)} · HABILIDAD: ${K(b.special)} · SPRINT: ${K(b.sprint)}`;
    text(this, VIEW_W / 2, 186, ctrl, { color: UI.focusLight });
    this.menu = new Menu(true);
    this.menu.add(new Button(this, VIEW_W / 2 - 66, VIEW_H - 22, 'PRACTICAR 30 S', () => fadeTo(this, 'Game', { tutorial: true }), 124, 18, UI.green));
    this.menu.add(new Button(this, VIEW_W / 2 + 66, VIEW_H - 22, 'VOLVER', () => fadeTo(this, 'Menu'), 124, 18));
  }

  /** Dibujo animado de cada viñeta. */
  private drawStep(c: Phaser.GameObjects.Container, i: number): void {
    const add = <T extends Phaser.GameObjects.GameObject>(o: T): T => {
      c.add(o);
      return o;
    };
    const runner = (team: 'chaser' | 'escapist', v: number, x: number, y: number) => {
      const key = charKey(team, v);
      return add(this.add.sprite(x, y, key, 'side_idle0').setOrigin(0.5, 1).play(`${key}_side_run`));
    };
    const look = profile.look;
    const loop = (targets: object, props: Record<string, unknown>, dur: number, delay = 0) =>
      this.tweens.add({ targets, ...props, duration: dur, delay, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
    switch (`${this.mode}:${i}`) {
      // ------------------------------------------------ PILLA
      case 'pilla:0': {
        const a = runner('escapist', 1, -20, 20);
        const b = runner('chaser', 2, -40, 20);
        loop(a, { x: 30 }, 1200);
        loop(b, { x: 10 }, 1200, 120);
        break;
      }
      case 'pilla:1': {
        runner('chaser', 3, -8, 20).stop();
        const ham = add(this.add.image(2, 8, 'ham').setOrigin(2 / 15, 4.5 / 9).setScale(1.5));
        loop(ham, { rotation: 1.6 }, 300);
        add(this.add.image(24, 6, 'p_star').setTint(0xfee761));
        break;
      }
      case 'pilla:2': {
        add(this.add.image(-10, 22, 'cage').setOrigin(0.5, 1));
        const r = runner('escapist', 4, 26, 20);
        loop(r, { x: 8 }, 900);
        add(this.add.image(-10, -12, 'p_ring').setTint(0x63c74d));
        break;
      }
      case 'pilla:3': {
        const clock = add(this.add.image(-14, 4, 'icon_clock').setScale(2));
        loop(clock, { rotation: 0.3 }, 400);
        const st = add(this.add.image(18, 4, 'p_star').setTint(0xfee761).setScale(2));
        loop(st, { scale: 2.6 }, 500);
        break;
      }
      // ------------------------------------------------ INFECCIÓN
      case 'infeccion:0': {
        const zk = ensureCharTexture(this, 'chaser', randomLook('Z'), 'zombie');
        const z = add(this.add.sprite(-30, 20, zk, 'side_idle0').setOrigin(0.5, 1).play(`${zk}_side_run`));
        const s = runner('escapist', 2, 0, 20);
        loop(z, { x: -8 }, 700);
        loop(s, { x: 20 }, 700);
        const v = add(this.add.image(-2, 0, 'p_virus').setScale(2));
        loop(v, { alpha: 0 }, 300);
        break;
      }
      case 'infeccion:1': {
        ['item_barrier', 'item_boot', 'item_grenade'].forEach((k, j) => {
          const im = add(this.add.image(-28 + j * 28, 6, k).setScale(1.5));
          loop(im, { y: 0 }, 500, j * 150);
        });
        break;
      }
      case 'infeccion:2': {
        const g = add(this.add.graphics());
        g.fillStyle(0x1a2a1a, 1).fillRect(-30, -20, 60, 40);
        g.lineStyle(1, 0x63c74d, 1).strokeRect(-30, -20, 60, 40);
        const dot = add(this.add.image(8, 4, 'p_ring').setTint(0xff5a5a));
        loop(dot, { scale: 1.8, alpha: 0.2 }, 400);
        break;
      }
      case 'infeccion:3': {
        const s = runner('escapist', 5, 0, 20).stop();
        const crown = add(this.add.image(0, -14, 'p_star').setTint(0xffd23f).setScale(1.5));
        loop(crown, { y: -18 }, 400);
        void s;
        break;
      }
      // ------------------------------------------------ BOMBA
      case 'bomba:0': {
        const ka = ensureCharTexture(this, null, look);
        const kb = ensureCharTexture(this, null, randomLook('B'));
        add(this.add.sprite(-26, 22, ka, 'side_idle0').setOrigin(0.5, 1).play(`${ka}_side_idle`));
        add(this.add.sprite(26, 22, kb, 'side_idle0').setOrigin(0.5, 1).setFlipX(true).play(`${kb}_side_idle`));
        const bomb = add(this.add.image(-26, -6, 'bomb_ham'));
        this.tweens.add({ targets: bomb, x: 26, duration: 700, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
        this.tweens.add({ targets: bomb, y: -16, duration: 350, yoyo: true, repeat: -1, ease: 'Sine.easeOut' });
        break;
      }
      case 'bomba:1': {
        const bomb = add(this.add.image(0, 4, 'bomb_ham').setScale(2.5));
        this.tweens.add({ targets: bomb, scale: 2.8, duration: 120, yoyo: true, repeat: -1 });
        break;
      }
      case 'bomba:2': {
        const parts = add(this.add.particles(0, 4, 'p_slice', { lifespan: 600, speed: { min: 15, max: 40 }, gravityY: 60, frequency: 150, quantity: 2 }));
        const conf = add(this.add.particles(0, 4, 'p_confetti', { lifespan: 600, speed: { min: 15, max: 40 }, gravityY: 60, frequency: 70, tint: [0xe43b44, 0xfee761, 0x63c74d, 0x2f88e8] }));
        void parts;
        void conf;
        break;
      }
      case 'bomba:3': {
        for (let j = 0; j < 4; j++) {
          const k = ensureCharTexture(this, null, randomLook('R' + j));
          const s = add(this.add.sprite(-30 + j * 20, 20, k, 'down_idle0').setOrigin(0.5, 1));
          if (j < 3) this.tweens.add({ targets: s, alpha: 0.15, delay: 600 + j * 600, duration: 200, yoyo: true, hold: 1600, repeat: -1, repeatDelay: 600 });
        }
        break;
      }
      // ------------------------------------------------ ESCONDITE
      case 'escondite:0': {
        const r = runner('escapist', 2, -10, 20).stop();
        const prop = add(this.add.image(-10, 20, 'prop_0_0').setOrigin(0.5, 19 / 20).setAlpha(0));
        this.tweens.add({ targets: r, alpha: 0, duration: 200, delay: 800, yoyo: true, hold: 1200, repeat: -1, repeatDelay: 400 });
        this.tweens.add({ targets: prop, alpha: 1, duration: 200, delay: 800, yoyo: true, hold: 1200, repeat: -1, repeatDelay: 400 });
        add(this.add.image(16, 20, 'prop_0_0').setOrigin(0.5, 19 / 20));
        break;
      }
      case 'escondite:1': {
        const p = add(this.add.image(0, 20, 'prop_6_0').setOrigin(0.5, 19 / 20).setScale(1.5));
        let r = 0;
        this.time.addEvent({ delay: 600, loop: true, callback: () => p.setTexture(`prop_6_${(r = (r + 1) % 4)}`) });
        break;
      }
      case 'escondite:2': {
        add(this.add.image(-16, 20, 'prop_5_0').setOrigin(0.5, 19 / 20));
        add(this.add.image(16, 20, 'prop_5_1').setOrigin(0.5, 19 / 20));
        const q = add(this.add.image(16, -8, 'p_hint').setScale(1.5));
        loop(q, { y: -14, alpha: 0.3 }, 400);
        break;
      }
      case 'escondite:3': {
        const k = ensureCharTexture(this, 'chaser', look, 'police');
        add(this.add.sprite(-18, 22, k, 'side_atk').setOrigin(0.5, 1));
        const ham = add(this.add.image(-12, 8, 'ham').setOrigin(2 / 15, 4.5 / 9));
        loop(ham, { rotation: 1.4 }, 260);
        const prop = add(this.add.image(16, 22, 'prop_3_0').setOrigin(0.5, 19 / 20));
        loop(prop, { x: 18 }, 60);
        add(this.add.bitmapText(16, -10, FONT, '-8').setTint(0xff5a5a).setOrigin(0.5));
        break;
      }
    }
  }

  update(_t: number, delta: number): void {
    const dt = delta / 1000;
    this.t += dt;
    this.backdrop.update(dt);
    if (this.howto) {
      if (input.back()) {
        audio.play('back');
        fadeTo(this, 'Menu');
        return;
      }
      this.menu?.update();
      return;
    }
    this.prompt.setAlpha(Math.floor(this.t * 2.5) % 2 === 0 ? 1 : 0.5);
    if (input.back()) {
      audio.play('back');
      fadeTo(this, 'ModeSelect');
      return;
    }
    const tap = this.tapped;
    this.tapped = false;
    if (input.confirm() || tap) {
      audio.play('click');
      fadeTo(this, 'MapSelect', { mode: this.mode });
    }
  }
}
