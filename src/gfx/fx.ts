import Phaser from 'phaser';
import { BiomeId } from '../world/maps';
import { FONT, fontText } from './font';
import { quality } from '../core/quality';

const DUST: Record<BiomeId, number[]> = {
  forest: [0xc8b98a, 0xa89a6e, 0xd8cfa8],
  desert: [0xf2d38a, 0xe0bb72, 0xfff1c4],
  snow: [0xffffff, 0xdce6f5, 0xc5d3ea],
  paris: [0xc8c2b8, 0xa9a49b, 0xe0dbd0],
  barcelona: [0xd9d3c8, 0xefd9a0, 0xbdb7ad],
  ceuta: [0xf2e8d0, 0xefd9a0, 0xe2d0a6],
  vegas: [0x4a3460, 0x6a4c84, 0xc9a04a],
  casa: [0xc8b090, 0xe0d0b8, 0xa08060],
};

/** Efectos visuales reutilizables de la partida. */
export class Fx {
  /** Ráfaga de partículas (menos con calidad baja o efectos reducidos). */
  private emit(em: Phaser.GameObjects.Particles.ParticleEmitter, x: number, y: number, n = 1): void {
    const k = quality.particles;
    const m = k >= 1 ? n : Math.floor(n * k + Math.random());
    if (m > 0) em.emitParticleAt(x, y, m);
  }

  private dust: Phaser.GameObjects.Particles.ParticleEmitter;
  private sparks: Phaser.GameObjects.Particles.ParticleEmitter;
  private stars: Phaser.GameObjects.Particles.ParticleEmitter;
  private smoke: Phaser.GameObjects.Particles.ParticleEmitter;
  private debris: Phaser.GameObjects.Particles.ParticleEmitter;
  private trail: Phaser.GameObjects.Particles.ParticleEmitter;
  private confettiE: Phaser.GameObjects.Particles.ParticleEmitter;
  private slices: Phaser.GameObjects.Particles.ParticleEmitter;
  private virus: Phaser.GameObjects.Particles.ParticleEmitter;
  private fuse: Phaser.GameObjects.Particles.ParticleEmitter;

  constructor(private scene: Phaser.Scene, biome: BiomeId) {
    this.confettiE = scene.add
      .particles(0, 0, 'p_confetti', {
        lifespan: { min: 900, max: 1600 },
        speed: { min: 60, max: 190 },
        angle: { min: 200, max: 340 },
        gravityY: 180,
        rotate: { min: 0, max: 360 },
        scale: { min: 0.8, max: 1.4 },
        tint: [0xe43b44, 0xfee761, 0x63c74d, 0x2f88e8, 0xff7ab8, 0xffffff],
        emitting: false,
      })
      .setDepth(9400);
    this.slices = scene.add
      .particles(0, 0, 'p_slice', {
        lifespan: { min: 700, max: 1200 },
        speed: { min: 50, max: 160 },
        gravityY: 240,
        rotate: { min: 0, max: 360 },
        emitting: false,
      })
      .setDepth(9401);
    this.virus = scene.add
      .particles(0, 0, 'p_virus', {
        lifespan: { min: 400, max: 900 },
        speed: { min: 10, max: 60 },
        scale: { start: 1.2, end: 0 },
        alpha: { start: 1, end: 0 },
        emitting: false,
      })
      .setDepth(8002);
    this.fuse = scene.add
      .particles(0, 0, 'p_px', {
        lifespan: { min: 150, max: 320 },
        speed: { min: 20, max: 60 },
        angle: { min: 200, max: 340 },
        scale: { start: 1, end: 0 },
        tint: [0xfee761, 0xfeae34, 0xffffff],
        emitting: false,
      })
      .setDepth(9003);
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
    this.emit(this.dust, x, y, n);
  }

  dashBurst(x: number, y: number): void {
    this.emit(this.dust, x, y, 8);
    this.trail.setParticleTint(0x7cc8ff);
    this.emit(this.trail, x, y - 6, 4);
  }

  speedTrail(x: number, y: number, color: number): void {
    this.trail.setParticleTint(color);
    this.emit(this.trail, x + Phaser.Math.Between(-3, 3), y - Phaser.Math.Between(0, 10), 1);
  }

  hit(x: number, y: number, dirX: number, dirY: number, colors: number[] = [0xffffff, 0xe43b44, 0xfee761]): void {
    const ang = Phaser.Math.RadToDeg(Math.atan2(dirY, dirX));
    this.sparks.setParticleTint(colors[0]);
    this.sparks.updateConfig({ angle: { min: ang - 55, max: ang + 55 } });
    for (const c of colors) {
      this.sparks.setParticleTint(c);
      this.emit(this.sparks, x, y, 4);
    }
    this.emit(this.stars, x, y, 1);
  }

  ko(x: number, y: number): void {
    this.sparks.updateConfig({ angle: { min: 0, max: 360 } });
    for (const c of [0xffffff, 0x7cc8ff, 0xfee761, 0xe43b44]) {
      this.sparks.setParticleTint(c);
      this.emit(this.sparks, x, y, 6);
    }
    this.emit(this.smoke, x, y, 8);
    this.ring(x, y, 0xffffff, 28);
  }

  smokePuff(x: number, y: number, n = 2): void {
    this.emit(this.smoke, x, y, n);
  }

  debrisAt(x: number, y: number, colors: number[]): void {
    for (const c of colors) {
      this.debris.setParticleTint(c);
      this.emit(this.debris, x, y, 4);
    }
  }

  sparkle(x: number, y: number, color: number): void {
    this.sparks.updateConfig({ angle: { min: 0, max: 360 } });
    this.sparks.setParticleTint(color);
    this.emit(this.sparks, x, y, 10);
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

  /** Chispa de la mecha del jamón bomba. */
  spark(x: number, y: number): void {
    this.emit(this.fuse, x, y, 2);
  }

  confetti(x: number, y: number, n = 30): void {
    this.emit(this.confettiE, x, y, n);
  }

  /** ¡BUM! Confeti, lonchas de jamón y humo. */
  explosion(x: number, y: number): void {
    this.emit(this.confettiE, x, y, 40);
    this.emit(this.slices, x, y, 14);
    this.emit(this.smoke, x, y, 14);
    this.sparks.updateConfig({ angle: { min: 0, max: 360 } });
    for (const c of [0xffffff, 0xfee761, 0xfeae34, 0xe43b44]) {
      this.sparks.setParticleTint(c);
      this.emit(this.sparks, x, y, 10);
    }
    this.ring(x, y, 0xfeae34, 60);
    this.ring(x, y, 0xffffff, 36);
  }

  /** Contagio: estallido de partículas verdes. */
  infect(x: number, y: number, n = 16): void {
    this.emit(this.virus, x, y, n);
    if (n > 4) this.ring(x, y, 0x9cff5a, 30);
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
