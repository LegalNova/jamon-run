/**
 * Cómo se ven los cosméticos: gorros, rastros al correr, efectos de golpe, marcos del nombre,
 * emotes y bailes de victoria. Lo usan la partida, la tienda y el podio.
 */
import Phaser from 'phaser';
import { cosItem } from '../../shared/economy';

/** Textura del gorro (o null). */
export function hatKey(id: string | undefined): string | null {
  return id && cosItem(id)?.cat === 'hat' ? `cos_${id}` : null;
}

/** Altura extra de algunos gorros sobre la cabeza. */
export function hatLift(id: string | undefined): number {
  return id === 'hat_aureola' ? 4 : id === 'hat_helice' ? 1 : 0;
}

const TRAILS: Record<string, { tex: string; tint: number[]; gravity: number; speed: number }> = {
  trail_stars: { tex: 'p_star', tint: [0xfee761, 0xffffff], gravity: 0, speed: 10 },
  trail_fire: { tex: 'p_flame', tint: [0xfeae34, 0xe43b44, 0xfee761], gravity: -60, speed: 12 },
  trail_hearts: { tex: 'p_heart', tint: [0xff7ab8, 0xe43b44], gravity: -30, speed: 10 },
  trail_lonchas: { tex: 'p_slice', tint: [0xffffff], gravity: 80, speed: 20 },
  trail_rainbow: { tex: 'p_px', tint: [0xe43b44, 0xfeae34, 0xfee761, 0x63c74d, 0x2f88e8, 0xb55088], gravity: 0, speed: 4 },
  trail_bubbles: { tex: 'p_bubble', tint: [0x9ae6ff, 0xffffff], gravity: -40, speed: 8 },
};

/** Emisor de partículas para el rastro (o null). */
export function makeTrail(scene: Phaser.Scene, id: string | undefined): Phaser.GameObjects.Particles.ParticleEmitter | null {
  const t = id ? TRAILS[id] : undefined;
  if (!t) return null;
  return scene.add
    .particles(0, 0, t.tex, {
      lifespan: { min: 350, max: 650 },
      speed: { min: 0, max: t.speed },
      gravityY: t.gravity,
      scale: { start: id === 'trail_rainbow' ? 1.5 : 0.9, end: 0 },
      alpha: { start: 1, end: 0 },
      rotate: id === 'trail_lonchas' ? { min: 0, max: 360 } : 0,
      tint: t.tint,
      emitting: false,
    })
    .setDepth(-300);
}

/** Efecto especial al golpear (además del normal). */
export function hitBurst(scene: Phaser.Scene, x: number, y: number, id: string | undefined): void {
  if (!id) return;
  const cfg: Record<string, { tex: string; tint: number[]; n: number; grav: number }> = {
    hit_confeti: { tex: 'p_confetti', tint: [0xe43b44, 0xfee761, 0x63c74d, 0x2f88e8, 0xff7ab8], n: 18, grav: 160 },
    hit_rayo: { tex: 'p_px', tint: [0xfee761, 0xffffff, 0x7cc8ff], n: 16, grav: 0 },
    hit_lonchas: { tex: 'p_slice', tint: [0xffffff], n: 8, grav: 200 },
    hit_corazones: { tex: 'p_heart', tint: [0xff4a6e, 0xff7ab8], n: 10, grav: -60 },
    hit_pixel: { tex: 'p_px', tint: [0x63c74d, 0x2f88e8, 0xb55088, 0xfee761], n: 24, grav: 120 },
  };
  const c = cfg[id];
  if (!c) return;
  const em = scene.add
    .particles(x, y, c.tex, { lifespan: 600, speed: { min: 40, max: 130 }, gravityY: c.grav, rotate: { min: 0, max: 360 }, scale: { start: 1, end: 0.2 }, tint: c.tint, emitting: false })
    .setDepth(9300);
  em.explode(c.n);
  if (id === 'hit_rayo') {
    // un rayo en zigzag
    const g = scene.add.graphics().setDepth(9301);
    g.lineStyle(2, 0xfee761, 1);
    g.beginPath();
    g.moveTo(x - 2, y - 26);
    g.lineTo(x + 3, y - 14);
    g.lineTo(x - 2, y - 12);
    g.lineTo(x + 2, y);
    g.strokePath();
    scene.tweens.add({ targets: g, alpha: 0, duration: 220, onComplete: () => g.destroy() });
  }
  scene.time.delayedCall(900, () => em.destroy());
}

/** Marco del nombre (se redibuja cada frame en los animados). */
export function drawFrame(g: Phaser.GameObjects.Graphics, cx: number, cy: number, w: number, id: string | undefined, t: number): void {
  g.clear();
  if (!id) return;
  const x = Math.round(cx - w / 2 - 3);
  const y = Math.round(cy - 6);
  const W = Math.round(w + 6);
  const H = 9;
  const col: Record<string, number> = { frame_oro: 0xffd23f, frame_fuego: 0xfeae34, frame_neon: 0x7cf6ff, frame_jamon: 0xc2414b };
  g.fillStyle(0x0d0b14, 0.65).fillRect(x, y, W, H);
  if (id === 'frame_arcoiris') {
    const cols = [0xe43b44, 0xfeae34, 0xfee761, 0x63c74d, 0x2f88e8, 0xb55088];
    for (let i = 0; i < W; i += 2) {
      const c = cols[(Math.floor(i / 2) + Math.floor(t * 8)) % cols.length];
      g.fillStyle(c, 1).fillRect(x + i, y, 2, 1).fillRect(x + i, y + H - 1, 2, 1);
    }
    g.fillStyle(cols[Math.floor(t * 8) % cols.length], 1).fillRect(x, y, 1, H).fillRect(x + W - 1, y, 1, H);
    return;
  }
  const c = col[id] ?? 0xffffff;
  const a = id === 'frame_neon' ? 0.6 + Math.sin(t * 6) * 0.4 : 1;
  g.lineStyle(1, c, a).strokeRect(x + 0.5, y + 0.5, W - 1, H - 1);
  if (id === 'frame_fuego') {
    for (let i = 2; i < W - 2; i += 4) {
      const h = 1 + Math.round(Math.abs(Math.sin(t * 9 + i)) * 2);
      g.fillStyle(i % 8 ? 0xfeae34 : 0xe43b44, 1).fillRect(x + i, y - h, 2, h);
    }
  }
  if (id === 'frame_oro') {
    g.fillStyle(0xffffff, 1).fillRect(x + ((Math.floor(t * 20) % (W - 2)) + 1), y, 1, 1);
  }
  if (id === 'frame_jamon') {
    g.fillStyle(0xf6dcc0, 1).fillRect(x + 1, y + H - 2, W - 2, 1);
  }
}

/** Baile de victoria: tweens en bucle sobre el sprite. Devuelve una función para pararlo. */
export function dance(scene: Phaser.Scene, s: Phaser.GameObjects.Sprite, id: string | undefined): () => void {
  const x0 = s.x;
  const y0 = s.y;
  const sx = s.scaleX;
  const sy = s.scaleY;
  const tweens: Phaser.Tweens.Tween[] = [];
  const add = (cfg: Phaser.Types.Tweens.TweenBuilderConfig) => tweens.push(scene.tweens.add(cfg));
  switch (id) {
    case 'dance_giro':
      add({ targets: s, scaleX: { from: sx, to: -sx }, yoyo: true, repeat: -1, duration: 160 });
      add({ targets: s, y: y0 - 6, yoyo: true, repeat: -1, duration: 320, ease: 'Sine.easeOut' });
      break;
    case 'dance_gusano':
      add({ targets: s, angle: { from: -14, to: 14 }, yoyo: true, repeat: -1, duration: 220, ease: 'Sine.easeInOut' });
      add({ targets: s, scaleY: sy * 0.85, yoyo: true, repeat: -1, duration: 220 });
      break;
    case 'dance_robot':
      add({ targets: s, angle: { from: -8, to: 8 }, yoyo: true, repeat: -1, duration: 260, ease: 'Stepped', easeParams: [3] });
      add({ targets: s, x: x0 + 3, yoyo: true, repeat: -1, duration: 520, ease: 'Stepped', easeParams: [2] });
      break;
    case 'dance_moon':
      add({ targets: s, x: { from: x0 + 10, to: x0 - 10 }, yoyo: true, repeat: -1, duration: 900, ease: 'Linear' });
      add({ targets: s, y: y0 - 2, yoyo: true, repeat: -1, duration: 150 });
      break;
    case 'dance_heli':
      add({ targets: s, angle: 360, repeat: -1, duration: 500 });
      add({ targets: s, y: y0 - 10, yoyo: true, repeat: -1, duration: 500, ease: 'Sine.easeInOut' });
      break;
    default:
      // saltitos
      add({ targets: s, y: y0 - 8, yoyo: true, repeat: -1, duration: 220, ease: 'Quad.easeOut' });
      add({ targets: s, scaleX: sx * 1.08, scaleY: sy * 0.92, yoyo: true, repeat: -1, duration: 220 });
  }
  return () => {
    for (const t of tweens) t.stop();
    s.setPosition(x0, y0).setScale(sx, sy).setAngle(0);
  };
}
