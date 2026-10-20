import Phaser from 'phaser';
import { VIEW_H, VIEW_W } from '../config/balance';
import { settings } from '../config/settings';
import { input } from '../core/input';
import { charKey } from '../gfx/characters';

/** Transición con fundido a negro. */
export function fadeTo(scene: Phaser.Scene, key: string, data?: object): void {
  const s = scene as Phaser.Scene & { __leaving?: boolean };
  if (s.__leaving) return;
  s.__leaving = true;
  input.consume();
  scene.cameras.main.fadeOut(180, 13, 11, 20);
  scene.cameras.main.once(Phaser.Cameras.Scene2D.Events.FADE_OUT_COMPLETE, () => {
    s.__leaving = false;
    scene.scene.start(key, data ?? {}); // sin datos, Phaser reutilizaría los del arranque anterior
  });
}

export function fadeIn(scene: Phaser.Scene, menuCamera = true): void {
  (scene as Phaser.Scene & { __leaving?: boolean }).__leaving = false;
  if (menuCamera) fitMenuCamera(scene);
  scene.cameras.main.fadeIn(200, 13, 11, 20);
}

/** Zoom entero y tamaño lógico de la vista (px de juego) para el tamaño actual de la ventana. */
export function viewSize(scene: Phaser.Scene): { Z: number; W: number; H: number } {
  const w = scene.scale.width;
  const h = scene.scale.height;
  const Z = Math.max(1, Math.floor(Math.min(w / VIEW_W, h / VIEW_H)));
  return { Z, W: w / Z, H: h / Z };
}

/**
 * Cámara de menú: zoom entero y el diseño de 480x270 centrado en la ventana.
 * Se reajusta sola al redimensionar.
 */
export function fitMenuCamera(scene: Phaser.Scene, onResize?: (W: number, H: number) => void): void {
  const apply = () => {
    const { Z, W, H } = viewSize(scene);
    const cam = scene.cameras.main;
    cam.setOrigin(0, 0);
    cam.setZoom(Z);
    cam.setScroll(-Math.round((W - VIEW_W) / 2), -Math.round((H - VIEW_H) / 2));
    onResize?.(W, H);
  };
  apply();
  scene.scale.on(Phaser.Scale.Events.RESIZE, apply);
  scene.events.once(Phaser.Scenes.Events.SHUTDOWN, () => scene.scale.off(Phaser.Scale.Events.RESIZE, apply));
}

/** Fondo animado de los menús con personajes persiguiéndose (ocupa toda la ventana). */
export class Backdrop {
  private bg: Phaser.GameObjects.TileSprite;
  private band: Phaser.GameObjects.Graphics;
  private dimRect: Phaser.GameObjects.Rectangle | null = null;
  private runners: { s: Phaser.GameObjects.Sprite; ham?: Phaser.GameObjects.Image; speed: number }[] = [];
  private t = 0;
  private W = VIEW_W;
  private H = VIEW_H;

  constructor(private scene: Phaser.Scene, private withRunners = true, dim = 0) {
    this.bg = scene.add.tileSprite(0, 0, VIEW_W, VIEW_H, 'bg_pattern').setOrigin(0).setDepth(-100).setScrollFactor(0);
    this.band = scene.add.graphics().setDepth(-90).setScrollFactor(0);
    if (dim > 0) this.dimRect = scene.add.rectangle(0, 0, VIEW_W, VIEW_H, 0x0d0b14, dim).setOrigin(0).setDepth(-80).setScrollFactor(0);
    const resize = () => this.resize();
    resize();
    scene.scale.on(Phaser.Scale.Events.RESIZE, resize);
    scene.events.once(Phaser.Scenes.Events.SHUTDOWN, () => scene.scale.off(Phaser.Scale.Events.RESIZE, resize));
    if (withRunners) this.spawnGroup(-40);
  }

  private resize(): void {
    const { W, H } = viewSize(this.scene);
    this.W = W;
    this.H = H;
    this.bg.setSize(Math.ceil(W), Math.ceil(H));
    this.dimRect?.setSize(Math.ceil(W), Math.ceil(H));
    this.band.clear();
    this.band.fillStyle(0x000000, 0.25).fillRect(0, H - 40, W, 40);
    this.band.fillStyle(0xffffff, 0.05).fillRect(0, H - 40, W, 1);
  }

  private spawnGroup(startX: number): void {
    const esc = Phaser.Math.Between(1, 3);
    const mk = (team: 'chaser' | 'escapist', x: number, row: number, i: number) => {
      const s = this.scene.add.sprite(x, 0, charKey(team, Phaser.Math.Between(0, 5)), 'side_idle0');
      s.setOrigin(0.5, 19 / 20).setDepth(-50 + i).setScrollFactor(0).setData('row', row);
      s.play(`${s.texture.key}_side_run`);
      const ham = team === 'chaser' ? this.scene.add.image(x, 0, 'ham').setOrigin(2 / 15, 4.5 / 9).setDepth(-49 + i).setScrollFactor(0) : undefined;
      this.runners.push({ s, ham, speed: 70 });
    };
    for (let i = 0; i < esc; i++) mk('escapist', startX + 60 + i * 22, i % 2, i);
    const ch = Phaser.Math.Between(1, 2);
    for (let i = 0; i < ch; i++) mk('chaser', startX - i * 26, (i + 1) % 2, i);
  }

  update(dt: number): void {
    this.t += dt;
    this.bg.tilePositionX += dt * 8;
    this.bg.tilePositionY += dt * 4;
    let allGone = this.runners.length > 0;
    for (const r of this.runners) {
      r.s.x += r.speed * dt;
      r.s.y = this.H - 14 - (r.s.getData('row') as number) * 6 + (Math.floor(this.t * 10) % 2 === 0 ? 0 : -1);
      r.ham?.setPosition(r.s.x + 3, r.s.y - 5).setRotation(-1.1 + Math.sin(this.t * 9) * 0.6);
      if (r.s.x < this.W + 40) allGone = false;
    }
    if (allGone) {
      for (const r of this.runners) {
        r.s.destroy();
        r.ham?.destroy();
      }
      this.runners = [];
      this.scene.time.delayedCall(Phaser.Math.Between(400, 1600), () => {
        if (this.scene.scene.isActive() && this.withRunners) this.spawnGroup(-40);
      });
    }
  }
}

/** Botón pequeño de pantalla completa (esquina de los menús). */
export function addFullscreenButton(scene: Phaser.Scene): void {
  const img = scene.add.image(0, 0, 'icon_fullscreen').setInteractive({ useHandCursor: true }).setDepth(50).setScrollFactor(0);
  const place = () => img.setPosition(Math.floor(viewSize(scene).W) - 12, 12);
  place();
  scene.scale.on(Phaser.Scale.Events.RESIZE, place);
  scene.events.once(Phaser.Scenes.Events.SHUTDOWN, () => scene.scale.off(Phaser.Scale.Events.RESIZE, place));
  img.on('pointerover', () => img.setTint(0xfee761));
  img.on('pointerout', () => img.clearTint());
  img.on('pointerup', () => toggleFullscreen());
}

/** Pantalla completa (Fullscreen API). Funciona desde cualquier escena y con la tecla F. */
export function toggleFullscreen(): void {
  settings.fullscreen = !document.fullscreenElement;
  applyFullscreen();
}

/** Activa/desactiva la pantalla completa según la opción guardada. */
export function applyFullscreen(): void {
  try {
    const el = document.documentElement;
    if (settings.fullscreen && !document.fullscreenElement) void el.requestFullscreen?.().catch(() => undefined);
    if (!settings.fullscreen && document.fullscreenElement) void document.exitFullscreen?.().catch(() => undefined);
  } catch {
    /* sin soporte */
  }
}
