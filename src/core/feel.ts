/**
 * "Game feel": temblor de pantalla, destellos y vibración del mando, todo en un sitio
 * para respetar la opción "Reducir efectos".
 */
import Phaser from 'phaser';
import { settings } from '../config/settings';
import { input } from './input';

export function shake(scene: Phaser.Scene, intensity: number, ms = 120): void {
  const k = settings.reduceFx ? 0.25 : 1;
  scene.cameras.main.shake(ms, intensity * k, true);
  if (intensity >= 0.006) input.rumble(Math.min(1, intensity * 60), ms);
}

export function flash(scene: Phaser.Scene, ms = 120, r = 255, g = 255, b = 255): void {
  if (settings.reduceFx) return;
  scene.cameras.main.flash(ms, r, g, b, true);
}

/** Efecto pequeño de "pop" en un objeto (crece y vuelve). */
export function pop(scene: Phaser.Scene, o: Phaser.GameObjects.Components.Transform & Phaser.GameObjects.GameObject, k = 1.3, ms = 140): void {
  const sx = (o as unknown as { scaleX: number }).scaleX;
  const sy = (o as unknown as { scaleY: number }).scaleY;
  scene.tweens.add({ targets: o, scaleX: sx * k, scaleY: sy * k, duration: ms / 2, yoyo: true, ease: 'Quad.easeOut' });
}
