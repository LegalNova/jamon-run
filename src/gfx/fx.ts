import Phaser from 'phaser';
import { BiomeId } from '../world/maps';
import { FONT, fontText } from './font';

const DUST: Record<BiomeId, number[]> = {
  forest: [0xc8b98a, 0xa89a6e, 0xd8cfa8],
  desert: [0xf2d38a, 0xe0bb72, 0xfff1c4],
  snow: [0xffffff, 0xdce6f5, 0xc5d3ea],
};

/** Efectos visuales reutilizables de la partida. */
export class Fx {
  private dust: Phaser.GameObjects.Particles.ParticleEmitter;
  private sparks: Phaser.GameObjects.Particles.ParticleEmitter;
  private stars: Phaser.GameObjects.Particles.ParticleEmitter;
  private smoke: Phaser.GameObjects.Particles.ParticleEmitter;
  private debris: Phaser.GameObjects.Particles.ParticleEmitter;
  private trail: Phaser.GameObjects.Particles.ParticleEmitter;

  constructor(private scene: Phaser.Scene, biome: BiomeId) {
    this.dust = scene.add
      .particles(0, 0, 'p_dust', {
        lifespan: { min: 280, max: 480 },
        speed: { min: 4, max: 16 },
        angle: { min: 200, max: 340 },
        scale: { start: 0.55, end: 0 },
        alpha: { start: 0.85, end: 0 },
        tint: DUST[biome],
        emitting: false,
      })
      .setDepth(-500);
    this.sparks = scene.add
      .particles(0, 0, 'p_px', {
        lifespan: { min: 220, max: 520 },
        speed: { min: 50, max: 150 },
        scale: { start: 1, end: 0.3 },
        gravityY: 220,
        emitting: false,
      })
      .setDepth(8000);
    this.stars = scene.add
      .particles(0, 0, 'p_star', {
        lifespan: 180,
        speed: 0,
        scale: { start: 1.2, end: 0 },
        emitting: false,
      })
      .setDepth(8001);
    this.smoke = scene.add
      .particles(0, 0, 'p_smoke', {
        lifespan: { min: 600, max: 1100 },
        speed: { min: 6, max: 26 },
        scale: { start: 0.6, end: 1.6 },
        alpha: { start: 0.85, end: 0 },
        tint: [0xc2c3c7, 0xdfe3ea, 0x9aa3b5],
        emitting: false,
      })
      .setDepth(7000);
    this.debris = scene.add
      .particles(0, 0, 'p_dot', {
        lifespan: { min: 300, max: 700 },
        speed: { min: 30, max: 110 },
        scale: { start: 2, end: 1 },
        gravityY: 260,
        emitting: false,
      })
      .setDepth(7999);
    this.trail = scene.add
      .particles(0, 0, 'p_px', {
        lifespan: 260,
        speed: 0,
        scale: { start: 1, end: 0 },
        alpha: { start: 0.9, end: 0 },
        emitting: false,
      })
      .setDepth(-400);
  }

  dustAt(x: number, y: number, n = 1): void {
    this.dust.emitParticleAt(x, y, n);
  }

  dashBurst(x: number, y: number): void {
    this.dust.emitParticleAt(x, y, 8);
    this.trail.setParticleTint(0x7cc8ff);
    this.trail.emitParticleAt(x, y - 6, 4);
  }

  speedTrail(x: number, y: number, color: number): void {
    this.trail.setParticleTint(color);
    this.trail.emitParticleAt(x + Phaser.Math.Between(-3, 3), y - Phaser.Math.Between(0, 10), 1);
  }

  hit(x: number, y: number, dirX: number, dirY: number, colors: number[] = [0xffffff, 0xe43b44, 0xfee761]): void {
    const ang = Phaser.Math.RadToDeg(Math.atan2(dirY, dirX));
    this.sparks.setParticleTint(colors[0]);
    this.sparks.updateConfig({ angle: { min: ang - 55, max: ang + 55 } });
    for (const c of colors) {
      this.sparks.setParticleTint(c);
      this.sparks.emitParticleAt(x, y, 4);
    }
    this.stars.emitParticleAt(x, y, 1);
  }

  ko(x: number, y: number): void {
    this.sparks.updateConfig({ angle: { min: 0, max: 360 } });
    for (const c of [0xffffff, 0x7cc8ff, 0xfee761, 0xe43b44]) {
      this.sparks.setParticleTint(c);
      this.sparks.emitParticleAt(x, y, 6);
    }
    this.smoke.emitParticleAt(x, y, 8);
    this.ring(x, y, 0xffffff, 28);
  }

  smokePuff(x: number, y: number, n = 2): void {
    this.smoke.emitParticleAt(x, y, n);
  }

  debrisAt(x: number, y: number, colors: number[]): void {
    for (const c of colors) {
      this.debris.setParticleTint(c);
      this.debris.emitParticleAt(x, y, 4);
    }
  }

  sparkle(x: number, y: number, color: number): void {
    this.sparks.updateConfig({ angle: { min: 0, max: 360 } });
    this.sparks.setParticleTint(color);
    this.sparks.emitParticleAt(x, y, 10);
    this.ring(x, y, color, 18);
  }

  ring(x: number, y: number, color: number, size = 20): void {
    const r = this.scene.add.image(x, y, 'p_ring').setTint(color).setDepth(7998).setScale(0.3);
    this.scene.tweens.add({
      targets: r,
      scale: size / 16,
      alpha: 0,
      duration: 320,
      ease: 'Quad.easeOut',
      onComplete: () => r.destroy(),
    });
  }

  float(x: number, y: number, text: string, color: number, big = false): void {
    const t = this.scene.add
      .bitmapText(Math.round(x), Math.round(y), FONT, fontText(text))
      .setOrigin(0.5, 1)
      .setTint(color)
      .setDepth(9500)
      .setScale(big ? 2 : 1);
    t.setScale(big ? 3 : 2);
    this.scene.tweens.add({ targets: t, scale: big ? 2 : 1, duration: 120, ease: 'Back.easeOut' });
    this.scene.tweens.add({
      targets: t,
      y: y - 18,
      duration: 750,
      ease: 'Cubic.easeOut',
    });
    this.scene.tweens.add({
      targets: t,
      alpha: 0,
      delay: 450,
      duration: 300,
      onComplete: () => t.destroy(),
    });
  }
}
