import Phaser from 'phaser';
import { PHRASES, RESCUE } from '../../shared/balance';
import { LOOK_COLORS } from '../../shared/look';
import { SimChar, SWING_TIME } from '../../shared/sim/Char';
import { Grid, Terrain } from '../../shared/grid';
import { CHAR_H, ensureCharTexture, Outfit } from '../gfx/characters';
import { drawFrame, hatKey, hatLift, makeTrail } from './cosmetics';
import { FONT, FONT_PLAIN, fontText } from '../gfx/font';
import type { Fx } from '../gfx/fx';
import { hexToInt, PAL, TEAM_COLORS } from '../gfx/palette';

type Facing = 'down' | 'up' | 'side';

/** Cómo se dibuja cada personaje según el modo (atuendo, jamón en la mano...). */
export interface CharStyle {
  outfit(c: SimChar): Outfit;
  hasHam(c: SimChar): boolean;
  indicator(c: SimChar): string;
}

/** Lo que la vista necesita saber del momento (quién mira, efectos activos...). */
export interface ViewCtx {
  viewer: SimChar;
  /** Urgencia del jamón bomba que lleva (0..2) o -1. */
  urgency: number;
  bigHeads: boolean;
  /** ¿El que mira es "enemigo" de este personaje? (para ocultar disfraces e invisibles). */
  enemy: boolean;
}

/** Parte visual de un personaje. Solo lee el estado (SimChar) y reacciona a eventos. */
export class CharacterView {
  readonly sprite: Phaser.GameObjects.Sprite;
  private shadow: Phaser.GameObjects.Image;
  private indicator: Phaser.GameObjects.Image;
  private ham: Phaser.GameObjects.Image | null = null;
  private shieldRing: Phaser.GameObjects.Image;
  private hpBar: Phaser.GameObjects.Graphics;
  private nameTag: Phaser.GameObjects.BitmapText | null = null;
  private bubble: Phaser.GameObjects.Container | null = null;
  private bubbleT = 0;
  private key: string;
  private lastHpDrawn = -1;
  private dustTimer = 0;
  private trailTimer = 0;
  private animKey = '';
  private tinted = false;
  private clock = Math.random() * 10;
  private swingT = 0;
  private hurtT = 0;
  private flashT = 0;
  private ghost = false;
  private ghostLift = 0;
  private cage: Phaser.GameObjects.Image;
  private trapG: Phaser.GameObjects.Graphics;
  private outfit: Outfit;
  private team: string;
  private prop: Phaser.GameObjects.Image | null = null;
  private bombImg: Phaser.GameObjects.Image | null = null;
  private head: Phaser.GameObjects.Sprite | null = null;
  private sparkT = 0;
  private hat: Phaser.GameObjects.Image | null = null;
  private trail: Phaser.GameObjects.Particles.ParticleEmitter | null = null;
  private trailT = 0;
  private frameG: Phaser.GameObjects.Graphics | null = null;
  private flames: Phaser.GameObjects.Particles.ParticleEmitter | null = null;
  private emoteImg: Phaser.GameObjects.Image | null = null;
  private emoteT = 0;

  constructor(
    private scene: Phaser.Scene,
    c: SimChar,
    readonly isPlayer: boolean,
    showName: boolean,
    private style: CharStyle,
  ) {
    this.outfit = style.outfit(c);
    this.team = c.team;
    this.key = ensureCharTexture(scene, c.team, c.look, this.outfit);
    this.shadow = scene.add.image(c.x, c.y, 'shadow').setAlpha(0.28).setDepth(-600);
    this.sprite = scene.add.sprite(c.x, c.y, this.key, 'down_idle0').setOrigin(0.5, (CHAR_H - 1) / CHAR_H);
    this.indicator = scene.add
      .image(c.x, c.y, isPlayer ? 'ind_player' : style.indicator(c))
      .setOrigin(0.5, 1)
      .setDepth(9000);
    if (style.hasHam(c)) this.ham = scene.add.image(c.x, c.y, 'ham').setOrigin(2 / 15, 4.5 / 9);
    // cosméticos
    const hk = hatKey(c.cos.hat);
    if (hk) this.hat = scene.add.image(c.x, c.y, hk).setOrigin(0.5, 1);
    this.trail = makeTrail(scene, c.cos.trail);
    if (c.cos.frame) this.frameG = scene.add.graphics().setDepth(9000);
    if (c.streak >= 2) {
      this.flames = scene.add
        .particles(0, 0, 'p_flame', { lifespan: 400, speed: { min: 4, max: 14 }, angle: { min: 250, max: 290 }, scale: { start: 1, end: 0 }, tint: [0xfeae34, 0xe43b44, 0xfee761], frequency: 70, quantity: 1 })
        .setDepth(9001);
    }
    this.shieldRing = scene.add.image(c.x, c.y, 'p_ring').setTint(0x7cc8ff).setVisible(false).setScale(1.25);
    this.hpBar = scene.add.graphics().setDepth(8990);
    this.cage = scene.add.image(c.x, c.y, 'cage').setOrigin(0.5, 1).setVisible(false);
    this.trapG = scene.add.graphics().setDepth(8995);
    if (showName && !isPlayer) {
      const col = hexToInt(LOOK_COLORS[c.look.color]?.hex ?? '#ffffff');
      this.nameTag = scene.add
        .bitmapText(c.x, c.y, FONT, fontText(c.name))
        .setOrigin(0.5, 1)
        .setDepth(9001)
        .setTint(col);
    }
  }

  // ------------------------------------------------------------------ eventos

  onSwing(): void {
    this.swingT = SWING_TIME;
  }

  onHit(): void {
    this.hurtT = 0.28;
    this.flashT = 0.09;
  }

  /** Cambio de equipo (te han infectado): nuevo atuendo, nuevo indicador. */
  private restyle(c: SimChar): void {
    this.outfit = this.style.outfit(c);
    this.team = c.team;
    this.key = ensureCharTexture(this.scene, c.team, c.look, this.outfit);
    this.animKey = '';
    if (!this.isPlayer) this.indicator.setTexture(this.style.indicator(c));
    const ham = this.style.hasHam(c);
    if (ham && !this.ham) this.ham = this.scene.add.image(c.x, c.y, 'ham').setOrigin(2 / 15, 4.5 / 9);
    if (!ham && this.ham) {
      this.ham.destroy();
      this.ham = null;
    }
  }

  /** Emote encima de la cabeza (tecla G). */
  showEmote(id: string): void {
    if (!this.scene.textures.exists(id)) return;
    this.emoteImg?.destroy();
    this.emoteImg = this.scene.add.image(this.sprite.x, this.sprite.y - 34, id).setDepth(9610).setScale(0);
    this.scene.tweens.add({ targets: this.emoteImg, scale: 1.4, duration: 220, ease: 'Back.easeOut' });
    this.emoteT = 1.8;
  }

  onKo(): void {
    this.ghost = true;
    this.hat?.setVisible(false);
    this.flames?.stop();
    this.prop?.setVisible(false);
    this.bombImg?.setVisible(false);
    this.head?.setVisible(false);
    this.sprite.setVisible(true);
    this.ghostLift = 0;
    this.sprite.clearTint();
    this.tinted = false;
    this.sprite.play('ghost_float');
    this.animKey = 'ghost';
    this.sprite.setAlpha(0.7).setFlipX(false);
    this.shadow.setVisible(false);
    this.indicator.setVisible(false);
    this.shieldRing.setVisible(false);
    this.ham?.setVisible(false);
    this.hpBar.clear();
    this.cage.setVisible(false);
    this.trapG.clear();
  }

  say(phrase: number, c: SimChar): void {
    this.bubble?.destroy();
    const text = fontText(PHRASES.list[phrase] ?? '');
    const t = this.scene.add.bitmapText(0, 0, FONT_PLAIN, text).setOrigin(0.5, 0.5).setTint(0x1a1424);
    const w = Math.max(14, t.width + 8);
    const h = 13;
    const g = this.scene.add.graphics();
    const border = c.isChaser ? TEAM_COLORS.chaser.main : TEAM_COLORS.escapist.main;
    g.fillStyle(border, 1).fillRect(-w / 2 - 1, -h / 2 - 1, w + 2, h + 2);
    g.fillStyle(0xffffff, 1).fillRect(-w / 2, -h / 2, w, h);
    // piquito
    g.fillStyle(border, 1).fillRect(-2, h / 2 + 1, 4, 1).fillRect(-1, h / 2 + 2, 2, 1);
    g.fillStyle(0xffffff, 1).fillRect(-1, h / 2, 2, 1);
    t.setY(0);
    this.bubble = this.scene.add.container(c.x, c.y, [g, t]).setDepth(9600).setScale(0.3);
    this.scene.tweens.add({ targets: this.bubble, scale: 1, duration: 160, ease: 'Back.easeOut' });
    this.bubbleT = PHRASES.bubbleSeconds;
  }

  // ------------------------------------------------------------------ dibujo

  update(dt: number, c: SimChar, hidden: boolean, grid: Grid, fx: Fx, vc: ViewCtx): void {
    this.clock += dt;
    this.swingT -= dt;
    this.hurtT -= dt;
    this.flashT -= dt;
    const footY = c.y + 3;
    if (c.team !== this.team && c.alive) this.restyle(c);
    // Invisible (premio de la ruleta): los enemigos casi no le ven.
    if (c.invisible > 0 && vc.enemy) hidden = true;
    this.updateBubble(dt, c, hidden || (c.disguise >= 0 && vc.enemy));

    if (!c.alive) {
      if (!this.ghost) this.onKo();
      if (!c.human) this.ghostLift = Math.min(14, this.ghostLift + dt * 8);
      const bob = Math.sin(this.clock * 3) * 2;
      this.sprite.setPosition(c.x, footY - this.ghostLift + bob);
      this.sprite.setDepth(9500);
      this.sprite.setAlpha(this.isPlayer ? 0.8 : 0.45);
      this.sprite.setFlipX(c.intent.mx < 0);
      this.nameTag?.setPosition(Math.round(c.x), Math.round(footY - 18 - this.ghostLift + bob)).setAlpha(0.5);
      return;
    }

    // Enjamonado: dentro de la jaula esperando rescate.
    this.cage.setVisible(c.trapped > 0 && !hidden);
    this.trapG.clear();
    if (c.trapped > 0) {
      const k = `${this.key}_down_hurt`;
      if (k !== this.animKey) {
        this.sprite.play(k, true);
        this.animKey = k;
      }
      if (this.tinted) {
        this.sprite.clearTint();
        this.tinted = false;
      }
      const shake = Math.sin(this.clock * 30) * (c.rescueProg > 0 ? 1 : 0);
      this.sprite.setPosition(c.x + shake, footY).setDepth(c.y).setAlpha(hidden ? 0.18 : 1).setFlipX(false);
      this.shadow.setPosition(c.x, footY);
      this.cage.setPosition(c.x, footY + 2).setDepth(c.y + 1);
      this.ham?.setVisible(false);
      this.hat?.setVisible(false);
      this.shieldRing.setVisible(false);
      this.hpBar.clear();
      this.lastHpDrawn = -3;
      const bob = Math.round(Math.sin(this.clock * 5) * 1.2);
      this.indicator.setPosition(c.x, footY - 27 + bob).setVisible(!hidden);
      this.nameTag?.setPosition(Math.round(c.x), Math.round(footY - 31 + bob)).setVisible(!hidden);
      if (!hidden) {
        // aro con el tiempo que le queda y barra de rescate
        const frac = Math.max(0, c.trapped / RESCUE.trapSeconds);
        const urgent = c.trapped < 4 && Math.floor(this.clock * 6) % 2 === 0;
        this.trapG.lineStyle(2, urgent ? 0xffffff : 0xfeae34, 0.9);
        this.trapG.beginPath();
        this.trapG.arc(c.x, footY - 9, 13, -Math.PI / 2, -Math.PI / 2 + frac * Math.PI * 2, false);
        this.trapG.strokePath();
        if (c.rescueProg > 0) {
          const w = 18;
          this.trapG.fillStyle(0x1a1424, 1).fillRect(c.x - w / 2 - 1, footY + 4, w + 2, 4);
          this.trapG.fillStyle(0x63c74d, 1).fillRect(c.x - w / 2, footY + 5, Math.round(w * Math.min(1, c.rescueProg)), 2);
        }
      }
      return;
    }

    const speed = Math.hypot(c.vx, c.vy);

    // Escondite: disfrazado de objeto. Igual que uno de verdad si está quieto.
    if (c.disguise >= 0) {
      const key = `prop_${c.disguise}_${c.rot}`;
      if (!this.prop) this.prop = this.scene.add.image(c.x, footY, key).setOrigin(0.5, 19 / 20);
      if (this.prop.texture.key !== key) {
        this.prop.setTexture(key);
        fx.smokePuff(c.x, c.y - 4, 3);
      }
      const moving = speed > 5 && !c.anchored;
      const shake = moving ? Math.round(Math.sin(this.clock * 40)) : 0;
      this.prop.setPosition(c.x + shake, footY).setDepth(c.y).setVisible(true).setAlpha(this.isPlayer ? 0.9 : 1);
      this.sprite.setVisible(false);
      this.shadow.setPosition(c.x, footY);
      this.ham?.setVisible(false);
      this.head?.setVisible(false);
      this.bombImg?.setVisible(false);
      this.hat?.setVisible(false);
      this.frameG?.clear();
      this.shieldRing.setVisible(false);
      this.hpBar.clear();
      this.lastHpDrawn = -3;
      const bob = Math.round(Math.sin(this.clock * 5) * 1.2);
      // Solo tú (y tus compañeros) sabéis quién es.
      this.indicator.setPosition(c.x, footY - 25 + bob).setVisible(!vc.enemy);
      this.nameTag?.setPosition(Math.round(c.x), Math.round(footY - 29 + bob)).setVisible(!vc.enemy);
      this.dustTimer -= dt;
      if (moving && this.dustTimer <= 0) {
        fx.dustAt(c.x, c.y + 3, 1);
        this.dustTimer = 0.12;
      }
      return;
    }
    if (this.prop?.visible) {
      this.prop.setVisible(false);
      fx.smokePuff(c.x, c.y - 4, 4);
    }
    this.sprite.setVisible(true);

    const ax = Math.abs(c.fx);
    const ay = Math.abs(c.fy);
    const dir: Facing = ax > ay * 0.9 ? 'side' : c.fy < 0 ? 'up' : 'down';

    let state = 'idle';
    if (this.hurtT > 0) state = 'hurt';
    else if (this.swingT > 0 && this.swingT < SWING_TIME - 0.02) state = 'atk';
    else if (speed > 12) state = 'run';
    const k = `${this.key}_${dir}_${state}`;
    if (k !== this.animKey) {
      this.sprite.play(k, true);
      this.animKey = k;
    }
    this.sprite.anims.timeScale = state === 'run' ? Phaser.Math.Clamp(speed / 70, 0.6, 2.2) : 1;

    this.sprite.setPosition(c.x, footY);
    this.sprite.setFlipX(dir === 'side' && c.fx < 0);
    this.sprite.setDepth(c.y);
    this.shadow.setPosition(c.x, footY);

    if (this.flashT > 0) {
      if (!this.tinted) {
        this.sprite.setTintFill(0xffffff);
        this.tinted = true;
      }
    } else if (this.tinted) {
      this.sprite.clearTint();
      this.tinted = false;
    }

    let alpha = 1;
    if (c.invuln > 0 && this.hurtT < 0.1 && Math.floor(this.clock * 18) % 2 === 0) alpha = 0.45;
    if (c.dashTime > 0) alpha = 0.7;
    if (c.inBush) alpha = Math.min(alpha, hidden ? 0.18 : 0.75);
    if (c.invisible > 0) alpha = Math.min(alpha, vc.enemy ? 0.08 : 0.4);
    this.sprite.setAlpha(alpha);

    // Cabezones (ruleta): una copia de la cabeza, más grande.
    if (vc.bigHeads) {
      if (!this.head) this.head = this.scene.add.sprite(c.x, footY, this.key, 'down_idle0').setOrigin(0.5, 12 / CHAR_H).setCrop(0, 0, 16, 12).setScale(1.8);
      const fr = this.sprite.frame.name;
      if (this.head.texture.key !== this.key || this.head.frame.name !== fr) this.head.setTexture(this.key, fr);
      this.head
        .setPosition(c.x, footY - 7)
        .setFlipX(this.sprite.flipX)
        .setDepth(c.y + 0.6)
        .setAlpha(alpha)
        .setVisible(true);
    } else this.head?.setVisible(false);

    // Jamón bomba sobre la cabeza, con chispas que se aceleran.
    if (c.bomb) {
      if (!this.bombImg) this.bombImg = this.scene.add.image(c.x, footY, 'bomb_ham').setOrigin(0.5, 1);
      const u = Math.max(0, vc.urgency);
      const pulse = 1 + Math.sin(this.clock * (8 + u * 10)) * (0.06 + u * 0.06);
      this.bombImg
        .setPosition(c.x, footY - (vc.bigHeads ? 32 : 22) + Math.round(Math.sin(this.clock * 7) * 1.5))
        .setScale(pulse)
        .setDepth(9002)
        .setVisible(!hidden)
        .setTint(u === 2 && Math.floor(this.clock * 12) % 2 === 0 ? 0xff8080 : 0xffffff);
      this.sparkT -= dt;
      if (this.sparkT <= 0 && !hidden) {
        this.sparkT = u === 2 ? 0.04 : u === 1 ? 0.09 : 0.16;
        fx.spark(c.x + 7, footY - (vc.bigHeads ? 44 : 34));
      }
    } else this.bombImg?.setVisible(false);

    const bob = Math.round(Math.sin(this.clock * 5) * 1.2);
    const lift = vc.bigHeads ? 10 : 0;
    this.indicator.setPosition(c.x, footY - 25 - lift + bob);
    this.indicator.setVisible(!hidden && !c.bomb);
    this.nameTag?.setPosition(Math.round(c.x), Math.round(footY - 29 - lift + bob)).setVisible(!hidden).setAlpha(1);

    // jamón en la mano
    if (this.ham) {
      const side = c.fx >= 0 ? 1 : -1;
      let hx = c.x;
      let hy = footY - 4;
      let depth = c.y + 0.5;
      if (dir === 'down') hx += 5;
      else if (dir === 'up') {
        hx -= 5;
        hy -= 1;
        depth = c.y - 0.5;
      } else hx += 3 * side;
      const baseAng = Math.atan2(c.fy, c.fx);
      let ang: number;
      if (this.swingT > 0) {
        const t = 1 - this.swingT / SWING_TIME;
        const e = 1 - Math.pow(1 - Math.min(1, t * 1.6), 3);
        ang = baseAng + side * Phaser.Math.Linear(-2.0, 1.35, e);
        depth = c.y + 0.5;
      } else {
        ang = baseAng - side * (1.15 + Math.sin(this.clock * 4) * 0.08);
      }
      this.ham.setPosition(hx, hy).setRotation(ang).setFlipY(side < 0).setDepth(depth);
      this.ham.setVisible(c.hamHidden <= 0 && !hidden);
      this.ham.setAlpha(c.inBush ? 0.75 : 1);
    }

    this.shieldRing.setVisible(c.shield && !hidden);
    if (c.shield) {
      this.shieldRing.setPosition(c.x, footY - 8).setDepth(c.y + 2);
      this.shieldRing.setAlpha(0.55 + Math.sin(this.clock * 6) * 0.25);
    }

    // barra de vida pequeña (la tiene quien puede recibir daño)
    if (c.maxHp < 900 && this.style.indicator(c) !== 'ind_infected') {
      const show = c.hp < c.maxHp && !hidden;
      const key = show ? c.hp : -2;
      if (key !== this.lastHpDrawn) {
        this.hpBar.clear();
        if (show) {
          const w = 14;
          const fill = Math.round((c.hp / c.maxHp) * (w - 2));
          this.hpBar.fillStyle(hexToInt(PAL.outline), 1).fillRect(-w / 2, 0, w, 4);
          this.hpBar.fillStyle(0x5a2030, 1).fillRect(-w / 2 + 1, 1, w - 2, 2);
          const col = c.hp > 50 ? 0x63c74d : c.hp > 25 ? 0xfeae34 : 0xe43b44;
          this.hpBar.fillStyle(col, 1).fillRect(-w / 2 + 1, 1, fill, 2);
        }
        this.lastHpDrawn = key;
      }
      this.hpBar.setPosition(Math.round(c.x), Math.round(footY - 24 + bob));
    }

    // cosméticos: gorro, rastro, marco del nombre, llamas de racha
    if (this.hat) {
      const big = vc.bigHeads;
      const headY = big ? footY - 7 - 12 * 1.8 + 6 : footY - 12 + (this.sprite.frame.name.endsWith('idle1') ? 1 : 0);
      this.hat
        .setPosition(c.x, headY - hatLift(c.cos.hat) * (big ? 1.8 : 1))
        .setScale(big ? 1.8 : 1)
        .setFlipX(this.sprite.flipX)
        .setDepth(c.y + 0.7)
        .setAlpha(alpha)
        .setVisible(!hidden);
    }
    this.trailT -= dt;
    if (this.trail && speed > 30 && this.trailT <= 0 && !hidden && c.invisible <= 0) {
      this.trail.emitParticleAt(c.x - c.vx * 0.05, c.y + 1, 1);
      this.trailT = 0.05;
    }
    if (this.frameG && this.nameTag) {
      if (hidden || !this.nameTag.visible) this.frameG.clear();
      else drawFrame(this.frameG, this.nameTag.x, this.nameTag.y - this.nameTag.height / 2, this.nameTag.width, c.cos.frame, this.clock);
    }
    if (this.flames) {
      this.flames.setPosition(c.x, footY - 30 - lift);
      this.flames.emitting = !hidden;
    }
    this.updateEmote(dt, c, footY - 36 - lift);

    // polvo al correr y estelas
    const onIce = grid.terrainAt(c.x, c.y) === Terrain.Ice;
    this.dustTimer -= dt;
    if (speed > 45 && this.dustTimer <= 0 && !onIce && !c.inBush) {
      fx.dustAt(c.x - c.vx * 0.04, c.y + 3, 1);
      this.dustTimer = c.sprinting ? 0.06 : 0.15;
    }
    if (onIce && speed > 60 && this.dustTimer <= 0) {
      fx.speedTrail(c.x, c.y + 3, 0xffffff);
      this.dustTimer = 0.08;
    }
    this.trailTimer -= dt;
    if (c.bootTime > 0 && this.trailTimer <= 0 && speed > 30) {
      fx.speedTrail(c.x, c.y, 0xfee761);
      this.trailTimer = 0.04;
    }
  }

  private updateEmote(dt: number, c: SimChar, y: number): void {
    if (!this.emoteImg) return;
    this.emoteT -= dt;
    this.emoteImg.setPosition(c.x, y + Math.sin(this.clock * 6) * 2);
    if (this.emoteT < 0.3) this.emoteImg.setAlpha(Math.max(0, this.emoteT / 0.3));
    if (this.emoteT <= 0) {
      this.emoteImg.destroy();
      this.emoteImg = null;
    }
  }

  private updateBubble(dt: number, c: SimChar, hidden: boolean): void {
    if (!this.bubble) return;
    this.bubbleT -= dt;
    const lift = this.nameTag ? 40 : 32;
    this.bubble.setPosition(Math.round(c.x), Math.round(c.y + 3 - lift));
    this.bubble.setVisible(!hidden);
    if (this.bubbleT < 0.3) this.bubble.setAlpha(Math.max(0, this.bubbleT / 0.3));
    if (this.bubbleT <= 0) {
      this.bubble.destroy();
      this.bubble = null;
    }
  }

  destroy(): void {
    this.sprite.destroy();
    this.shadow.destroy();
    this.indicator.destroy();
    this.ham?.destroy();
    this.shieldRing.destroy();
    this.hpBar.destroy();
    this.nameTag?.destroy();
    this.bubble?.destroy();
    this.cage.destroy();
    this.trapG.destroy();
    this.prop?.destroy();
    this.bombImg?.destroy();
    this.head?.destroy();
    this.hat?.destroy();
    this.trail?.destroy();
    this.frameG?.destroy();
    this.flames?.destroy();
    this.emoteImg?.destroy();
  }
}
