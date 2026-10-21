import Phaser from 'phaser';
import { BALANCE } from '../../shared/balance';
import type { PickupType } from '../../shared/sim/types';
import type { PickupLike, ProjectileLike } from './model';

export const PICKUP_NAMES: Record<PickupType, string> = {
  medkit: 'BOTIQUÍN',
  boot: 'BOTA VELOZ',
  shield: 'ESCUDO',
  gold: 'JAMÓN DE ORO',
  barrier: 'BARRERA (E)',
  grenade: 'GRANADA DE HUMO (E)',
  coin: 'MONEDA',
};

export const PICKUP_COLORS: Record<PickupType, number> = {
  medkit: 0xff6b6b,
  boot: 0xfee761,
  shield: 0x7cc8ff,
  gold: 0xffd23f,
  barrier: 0xfeae34,
  grenade: 0xc2c3c7,
  coin: 0xffd23f,
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
    this.coin = p.type === 'coin';
    if (this.coin) {
      this.glow.setVisible(false);
      this.sprite.y -= 20;
    }
  }

  private coin = false;

  update(dt: number, p: PickupLike): void {
    this.t += dt;
    if (this.coin) {
      // Las monedas caen del cielo y giran.
      const target = p.y - 5 + Math.round(Math.sin(this.t * 6) * 1);
      this.sprite.y = Math.min(target, this.sprite.y + dt * 160);
      this.sprite.scaleX = Math.cos(this.t * 7);
      return;
    }
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

/** Objeto del mapa en el Escondite (mismo dibujo y ancla que un escondido disfrazado). */
export class PropView {
  readonly sprite: Phaser.GameObjects.Image;
  private shadow: Phaser.GameObjects.Image;
  private wobble = 0;

  constructor(scene: Phaser.Scene, readonly x: number, readonly y: number, k: number, rot: number) {
    this.shadow = scene.add.image(x, y + 3, 'shadow').setAlpha(0.28).setDepth(-600);
    this.sprite = scene.add.image(x, y + 3, `prop_${k}_${rot}`).setOrigin(0.5, 19 / 20).setDepth(y);
  }

  /** Golpe de un buscador: tiembla (es un objeto de verdad). */
  hit(): void {
    this.wobble = 0.4;
  }

  update(dt: number): void {
    if (this.wobble <= 0) return;
    this.wobble -= dt;
    this.sprite.x = this.x + Math.round(Math.sin(this.wobble * 60) * 1.5);
    if (this.wobble <= 0) this.sprite.x = this.x;
  }

  destroy(): void {
    this.sprite.destroy();
    this.shadow.destroy();
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
