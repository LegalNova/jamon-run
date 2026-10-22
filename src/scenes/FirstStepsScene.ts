import Phaser from 'phaser';
import { keyName, saveSettings, settings } from '../config/settings';
import { audio } from '../core/audio';
import { input } from '../core/input';
import { IS_TOUCH } from '../core/touch';
import { fontText } from '../gfx/font';
import { Button, panel, text, UI } from '../ui/widgets';
import { viewSize } from './common';
import type { GameScene } from './GameScene';

/**
 * TUTORIAL JUGABLE (la primera vez, ~30 s): moverse, golpear y sprint, con los controles
 * del dispositivo (teclado, mando o táctil). Se puede saltar en cualquier momento.
 * Va encima de una partida de verdad en la plaza con dos muñecos quietos.
 */
export const FIRST_STEPS = {
  /** Puntos a los que hay que llegar andando. */
  walkMarks: 3,
  /** Distancia (px) a la que cuenta que has llegado. */
  reach: 14,
  /** Lo lejos que se pone la meta del sprint (px). */
  sprintDist: 150,
};

type Step = 'wait' | 'move' | 'hit' | 'sprint' | 'done';

export class FirstStepsScene extends Phaser.Scene {
  private gs!: GameScene;
  private step: Step = 'wait';
  private marks: { x: number; y: number }[] = [];
  private markG!: Phaser.GameObjects.Graphics;
  private title!: Phaser.GameObjects.BitmapText;
  private hint!: Phaser.GameObjects.BitmapText;
  private t = 0;
  private sprinted = 0;
  private lastEnergy = 0;
  private next = 'Menu';
  private leaving = false;

  constructor() {
    super('FirstSteps');
  }

  init(data: { next?: string }): void {
    this.next = data.next ?? 'Menu';
    this.step = 'wait';
    this.t = 0;
    this.sprinted = 0;
    this.leaving = false;
  }

  create(): void {
    this.gs = this.scene.get('Game') as GameScene;
    const { Z, W, H } = viewSize(this);
    this.cameras.main.setZoom(Z).setOrigin(0, 0).setScroll(0, 0);
    // En el ordenador, abajo (arriba sale el jugador); en el móvil, arriba (abajo van los controles).
    const y0 = IS_TOUCH ? 44 : H - 96;
    const g = this.add.graphics().setAlpha(0.92);
    panel(g, W / 2 - 120, y0, 240, 34, 0x15111f);
    this.title = text(this, W / 2, y0 + 10, 'TUTORIAL', { scale: 1, color: UI.focusLight });
    this.hint = text(this, W / 2, y0 + 24, '', { color: UI.text });
    // Solo con el ratón o el dedo (ESPACIO es golpear, no "saltar tutorial").
    new Button(this, W / 2, y0 + 48, 'SALTAR TUTORIAL', () => this.finish(), 100, 15);
    // Marcas en el mundo (en la escena de la partida, para que sigan a la cámara).
    this.markG = this.gs.add.graphics().setDepth(9500);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.markG.destroy());
  }

  /** Controles según el dispositivo que esté usando ahora. */
  private ctrl(what: 'move' | 'hit' | 'sprint'): string {
    const b = settings.bindings;
    if (IS_TOUCH || input.lastDevice === 'touch') return { move: 'ARRASTRA EL DEDO A LA IZQUIERDA', hit: 'TOCA EL BOTÓN GOLPE', sprint: 'MANTÉN EL BOTÓN SPRINT' }[what];
    if (input.lastDevice === 'gamepad') return { move: 'MUEVE EL STICK', hit: 'PULSA A', sprint: 'MANTÉN RB' }[what];
    return {
      move: `${keyName(b.up)}${keyName(b.left)}${keyName(b.down)}${keyName(b.right)} O FLECHAS`,
      hit: `PULSA ${keyName(b.action)}`,
      sprint: `MANTÉN ${keyName(b.sprint)}`,
    }[what];
  }

  private set(step: Step): void {
    this.step = step;
    const p = this.gs.player;
    const grid = this.gs.model.grid;
    // El sitio libre más cercano a un punto (para no poner metas dentro de una pared).
    const free = (x: number, y: number) => grid.tileCenter(grid.nearestWalkable(x, y));
    if (step === 'move') {
      this.marks = [free(p.x + 56, p.y), free(p.x + 56, p.y - 48), free(p.x - 40, p.y - 48)];
      this.title.setText(fontText('1/3 · ¡MUÉVETE!'));
    } else if (step === 'hit') {
      this.marks = [];
      this.title.setText(fontText('2/3 · ¡ENJAMONA A UN MUÑECO!'));
    } else if (step === 'sprint') {
      // Meta en línea recta y sin obstáculos, en la dirección más despejada.
      let best = { x: p.x, y: p.y, d: 0 };
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        let d = FIRST_STEPS.sprintDist;
        while (d > 40 && !grid.clearPath(p.x, p.y, p.x + dx * d, p.y + dy * d, 6)) d -= 10;
        if (d > best.d) best = { x: p.x + dx * d, y: p.y + dy * d, d };
      }
      this.marks = [best];
      this.sprinted = 0;
      this.lastEnergy = p.energy;
      this.title.setText(fontText('3/3 · ¡SPRINT HASTA LA META!'));
    }
    if (step !== 'done') this.hint.setText(fontText(this.ctrl(step === 'wait' ? 'move' : step)));
    audio.play('reveal');
    input.vibrate(30);
  }

  /** Fin (o "saltar"): no se vuelve a mostrar y vamos a donde tocaba. */
  private finish(): void {
    if (this.leaving) return;
    this.leaving = true;
    settings.tutorialDone = true;
    saveSettings();
    input.consume();
    input.releaseAll();
    this.gs.model?.destroy();
    this.scene.stop('UI');
    this.scene.stop('Game');
    audio.playMusic('menu');
    this.scene.start(this.next);
  }

  update(_t: number, delta: number): void {
    const dt = delta / 1000;
    this.t += dt;
    if (this.leaving) return;
    const m = this.gs.model;
    const p = this.gs.player;
    if (!m || !p) return;
    if (this.step === 'wait') {
      this.title.setText(fontText('¡PREPÁRATE!'));
      this.hint.setText(fontText(this.ctrl('move')));
      // Los perseguidores salen a los 2 s de empezar.
      if (m.state === 'play' && m.matchTime > 2.2) this.set('move');
    } else if (this.step === 'move') {
      const i = this.marks.findIndex((k) => Math.hypot(k.x - p.x, k.y - p.y) < FIRST_STEPS.reach);
      if (i >= 0) {
        this.marks.splice(i, 1);
        audio.play('coin');
        if (!this.marks.length) this.set('hit');
      }
    } else if (this.step === 'hit') {
      const dummies = m.chars.filter((c) => c.team === 'escapist');
      if (dummies.some((c) => !c.free)) this.set('sprint');
      // Flecha encima del muñeco más cercano.
      const d = dummies.filter((c) => c.free).sort((a, b) => Math.hypot(a.x - p.x, a.y - p.y) - Math.hypot(b.x - p.x, b.y - p.y))[0];
      this.marks = d ? [{ x: d.x, y: d.y - 22 }] : [];
    } else if (this.step === 'sprint') {
      if (p.energy < this.lastEnergy - 0.01) this.sprinted += dt;
      this.lastEnergy = p.energy;
      const k = this.marks[0];
      if (k && Math.hypot(k.x - p.x, k.y - p.y) < FIRST_STEPS.reach * 1.5) {
        if (this.sprinted > 0.3) {
          this.step = 'done';
          this.title.setText(fontText('¡LISTO! YA SABES JUGAR'));
          this.hint.setText(fontText('¡A POR ELLOS!'));
          audio.play('win');
          input.vibrate([30, 40, 30]);
          this.time.delayedCall(1300, () => this.finish());
        } else this.hint.setText(fontText(`¡CON SPRINT! ${this.ctrl('sprint')}`));
      }
    }
    // Marcas que laten.
    const g = this.markG.clear();
    const pulse = 1 + Math.sin(this.t * 6) * 0.2;
    for (const k of this.marks) {
      if (this.step === 'hit') {
        g.fillStyle(0xfee761, 1).fillTriangle(k.x - 5, k.y - 6 * pulse, k.x + 5, k.y - 6 * pulse, k.x, k.y + 2);
        continue;
      }
      g.lineStyle(2, 0xfee761, 0.9).strokeCircle(k.x, k.y, 9 * pulse);
      g.fillStyle(0xfee761, 0.25).fillCircle(k.x, k.y, 9 * pulse);
    }
  }
}
