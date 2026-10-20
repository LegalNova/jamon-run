import Phaser from 'phaser';
import { PHRASES, RESCUE } from '../../shared/balance';
import { LOOK_COLORS } from '../../shared/look';
import { SimChar, SWING_TIME } from '../../shared/sim/Char';
import { Grid, Terrain } from '../../shared/grid';
import { CHAR_H, ensureCharTexture } from '../gfx/characters';
import { FONT, FONT_PLAIN, fontText } from '../gfx/font';
import type { Fx } from '../gfx/fx';
import { hexToInt, PAL, TEAM_COLORS } from '../gfx/palette';

type Facing = 'down' | 'up' | 'side';

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

  constructor(
    private scene: Phaser.Scene,
    c: SimChar,
    readonly isPlayer: boolean,
    showName: boolean,
  ) {
    this.key = ensureCharTexture(scene, c.team, c.look);
    this.shadow = scene.add.image(c.x, c.y, 'shadow').setAlpha(0.28).setDepth(-600);
    this.sprite = scene.add.sprite(c.x, c.y, this.key, 'down_idle0').setOrigin(0.5, (CHAR_H - 1) / CHAR_H);
    this.indicator = scene.add
      .image(c.x, c.y, isPlayer ? 'ind_player' : c.isChaser ? 'ind_chaser' : 'ind_escapist')
      .setOrigin(0.5, 1)
      .setDepth(9000);
    if (c.isChaser) this.ham = scene.add.image(c.x, c.y, 'ham').setOrigin(2 / 15, 4.5 / 9);
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

  onKo(): void {
    this.ghost = true;
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

  update(dt: number, c: SimChar, hidden: boolean, grid: Grid, fx: Fx): void {
    this.clock += dt;
    this.swingT -= dt;
    this.hurtT -= dt;
    this.flashT -= dt;
    const footY = c.y + 3;
    this.updateBubble(dt, c, hidden);

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

    const ax = Math.abs(c.fx);
    const ay = Math.abs(c.fy);
    const dir: Facing = ax > ay * 0.9 ? 'side' : c.fy < 0 ? 'up' : 'down';
    const speed = Math.hypot(c.vx, c.vy);

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
    this.sprite.setAlpha(alpha);

    const bob = Math.round(Math.sin(this.clock * 5) * 1.2);
    this.indicator.setPosition(c.x, footY - 25 + bob);
    this.indicator.setVisible(!hidden);
    this.nameTag?.setPosition(Math.round(c.x), Math.round(footY - 29 + bob)).setVisible(!hidden).setAlpha(1);

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

    // barra de vida pequeña (solo el equipo rojo tiene vida)
    if (!c.isChaser) {
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
  }
}
