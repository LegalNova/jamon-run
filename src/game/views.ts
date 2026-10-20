import Phaser from 'phaser';
import { BALANCE } from '../../shared/balance';
import type { PickupType } from '../../shared/sim/types';
import type { PickupLike, ProjectileLike } from './model';

export const PICKUP_NAMES: Record<PickupType, string> = {
  medkit: 'BOTIQUÍN',
  boot: 'BOTA VELOZ',
  shield: 'ESCUDO',
  gold: 'JAMÓN DE ORO',
};

export const PICKUP_COLORS: Record<PickupType, number> = {
  medkit: 0xff6b6b,
  boot: 0xfee761,
  shield: 0x7cc8ff,
  gold: 0xffd23f,
};

/** Objeto en el suelo que flota y parpadea antes de desaparecer. */
export class PickupView {
  private sprite: Phaser.GameObjects.Image;
  private shadow: Phaser.GameObjects.Image;
  private glow: Phaser.GameObjects.Image;
  private t = Math.random() * 6;

  constructor(scene: Phaser.Scene, p: PickupLike) {
    this.shadow = scene.add.image(p.x, p.y + 4, 'shadow').setAlpha(0.25).setDepth(-600).setScale(0.8);
    this.glow = scene.add.image(p.x, p.y - 4, 'p_ring').setTint(PICKUP_COLORS[p.type]).setAlpha(0.5).setDepth(p.y - 1);
    this.sprite = scene.add.image(p.x, p.y - 4, 'item_' + p.type).setDepth(p.y).setScale(0);
    scene.tweens.add({ targets: this.sprite, scale: 1, duration: 280, ease: 'Back.easeOut' });
  }

  update(dt: number, p: PickupLike): void {
    this.t += dt;
    const bob = Math.round(Math.sin(this.t * 4) * 1.5);
    this.sprite.y = p.y - 5 + bob;
    this.glow.y = p.y - 5 + bob;
    this.glow.setScale(0.9 + Math.sin(this.t * 5) * 0.12);
    this.sprite.setVisible(!(p.life < 4 && Math.floor(this.t * 8) % 2 === 0));
  }

  destroy(): void {
    this.sprite.destroy();
    this.shadow.destroy();
    this.glow.destroy();
  }
}

/** Jamón lanzado girando por el aire. */
export class ProjectileView {
  private sprite: Phaser.GameObjects.Image;
  private shadow: Phaser.GameObjects.Image;

  constructor(scene: Phaser.Scene, p: ProjectileLike) {
    this.shadow = scene.add.image(p.x, p.y + 3, 'shadow').setAlpha(0.25).setScale(0.6).setDepth(-600);
    this.sprite = scene.add.image(p.x, p.y - 8, 'ham').setDepth(p.y + 4);
  }

  update(dt: number, p: ProjectileLike): void {
    const arc = Math.sin(Math.min(1, p.travelled / BALANCE.chaser.throwRange) * Math.PI) * 6;
    this.sprite.setPosition(p.x, p.y - 8 - arc);
    this.sprite.rotation += dt * 18;
    this.sprite.setDepth(p.y + 4);
    this.shadow.setPosition(p.x, p.y + 3);
  }

  destroy(): void {
    this.sprite.destroy();
    this.shadow.destroy();
  }
}
