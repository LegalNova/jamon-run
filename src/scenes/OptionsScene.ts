import Phaser from 'phaser';
import { BALANCE, Difficulty, VIEW_H, VIEW_W } from '../config/balance';
import { saveSettings, settings } from '../config/settings';
import { audio } from '../core/audio';
import { input } from '../core/input';
import { Button, Menu, OptionRow, text, UI } from '../ui/widgets';
import { applyFullscreen, Backdrop, fadeIn, fadeTo, fitMenuCamera, viewSize } from './common';

const DIFFS: Difficulty[] = ['easy', 'normal', 'hard'];
const DIFF_NAMES: Record<Difficulty, string> = { easy: 'FÁCIL', normal: 'NORMAL', hard: 'DIFÍCIL' };

function fmtTime(s: number): string {
  return `${Math.floor(s / 60)}:${(s % 60).toString().padStart(2, '0')}`;
}

export class OptionsScene extends Phaser.Scene {
  private menu!: Menu;
  private from: 'Menu' | 'Pause' = 'Menu';
  private backdrop: Backdrop | null = null;

  constructor() {
    super('Options');
  }

  init(data: { from?: 'Menu' | 'Pause' }): void {
    this.from = data.from ?? 'Menu';
  }

  create(): void {
    if (this.from === 'Menu') {
      fadeIn(this);
      this.backdrop = new Backdrop(this, false);
    } else {
      this.backdrop = null;
      const dim = this.add.rectangle(0, 0, VIEW_W, VIEW_H, 0x0d0b14, 0.85).setOrigin(0).setScrollFactor(0);
      fitMenuCamera(this, () => {
        const { W, H } = viewSize(this);
        dim.setSize(Math.ceil(W), Math.ceil(H));
      });
    }
    text(this, VIEW_W / 2, 12, 'OPCIONES', { scale: 2, color: UI.focusLight });
    const m = BALANCE.match;
    this.menu = new Menu();
    const pct = (v: number) => `${Math.round(v * 100)}%`;
    const step = (v: number, d: number) => Math.round(Math.min(1, Math.max(0, v + d * 0.1)) * 10) / 10;
    const rows: [string, () => string, (d: number) => void][] = [
      ['VOLUMEN MÚSICA', () => pct(settings.musicVolume), (d) => { settings.musicVolume = step(settings.musicVolume, d); audio.applyVolumes(); }],
      ['VOLUMEN EFECTOS', () => pct(settings.sfxVolume), (d) => { settings.sfxVolume = step(settings.sfxVolume, d); audio.applyVolumes(); }],
      ['DIFICULTAD', () => DIFF_NAMES[settings.difficulty], (d) => { settings.difficulty = DIFFS[(DIFFS.indexOf(settings.difficulty) + d + 3) % 3]; }],
      ['PANTALLA COMPLETA', () => (settings.fullscreen ? 'SÍ' : 'NO'), () => { settings.fullscreen = !settings.fullscreen; applyFullscreen(); }],
      ['VOCES', () => (settings.voices ? 'SÍ' : 'NO'), () => { settings.voices = !settings.voices; }],
      ['REDUCIR EFECTOS', () => (settings.reduceFx ? 'SÍ' : 'NO'), () => { settings.reduceFx = !settings.reduceFx; }],
      ['VIBRACIÓN MANDO', () => (settings.rumble ? 'SÍ' : 'NO'), () => { settings.rumble = !settings.rumble; }],
      ['DURACIÓN PARTIDA', () => fmtTime(settings.duration), (d) => {
        const o = m.durationOptions as readonly number[];
        const i = Math.max(0, o.indexOf(settings.duration));
        settings.duration = o[(i + d + o.length) % o.length];
      }],
      ['PERSEGUIDORES', () => String(settings.chasers), (d) => {
        settings.chasers = Phaser.Math.Clamp(settings.chasers + d, m.minChasers, m.maxChasers);
      }],
      ['ESCAPISTAS', () => String(settings.escapists), (d) => {
        settings.escapists = Phaser.Math.Clamp(settings.escapists + d, m.minEscapists, m.maxEscapists);
      }],
    ];
    rows.forEach(([label, get, change], i) => {
      this.menu.add(new OptionRow(this, VIEW_W / 2, 34 + i * 16, label, get, (d) => { change(d); saveSettings(); }));
    });
    this.menu.add(new Button(this, VIEW_W / 2, 34 + rows.length * 16 + 8, 'VOLVER', () => this.back(), 90, 16));
    text(this, VIEW_W / 2, VIEW_H - 26, '↑↓ ELEGIR · ← → CAMBIAR · ESC VOLVER', { color: UI.muted });
    text(this, VIEW_W / 2, VIEW_H - 14,
      this.from === 'Pause' ? 'DIFICULTAD, DURACIÓN Y EQUIPOS: EN LA PRÓXIMA PARTIDA' : 'LOS CAMBIOS SE GUARDAN SOLOS',
      { color: this.from === 'Pause' ? UI.focus : UI.muted });
    const onFs = () => this.menu && this.refreshRows();
    document.addEventListener('fullscreenchange', onFs);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => document.removeEventListener('fullscreenchange', onFs));
  }

  private refreshRows(): void {
    this.children.list.forEach((c) => {
      if (c instanceof OptionRow) c.refresh();
    });
  }

  private back(): void {
    saveSettings();
    input.consume();
    if (this.from === 'Pause') {
      this.scene.stop();
      this.scene.wake('Pause');
    } else {
      fadeTo(this, 'Menu');
    }
  }

  update(_t: number, delta: number): void {
    this.backdrop?.update(delta / 1000);
    if (input.back()) {
      audio.play('back');
      this.back();
      return;
    }
    this.menu.update();
  }
}
