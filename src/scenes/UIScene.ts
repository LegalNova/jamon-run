import Phaser from 'phaser';
import { houseLayout, lightOn } from '../../shared/house';
import { BALANCE, HYPE, MODES, PHRASES, TILE } from '../config/balance';
import { keyName, settings } from '../config/settings';
import { audio } from '../core/audio';
import { input } from '../core/input';
import { abilityFor, modeInfo } from '../../shared/modes/rules';
import type { SimChar } from '../../shared/sim/Char';
import type { Ability, ModeId } from '../../shared/sim/types';
import { PICKUP_COLORS } from '../game/views';
import { FONT, fontText } from '../gfx/font';
import { Team } from '../gfx/characters';
import { TEAM_COLORS } from '../gfx/palette';
import { GLOBAL_LABELS, HypeOverlay } from '../ui/hype';
import { panel, text, UI } from '../ui/widgets';
import { viewSize } from './common';
import type { GameScene } from './GameScene';

interface FeedLine {
  t: Phaser.GameObjects.BitmapText;
  life: number;
}

/** Icono y nombre de cada habilidad en las casillas del HUD. */
const ABILITY_UI: Record<Ability, { icon: string; label: string; rot?: number }> = {
  attack: { icon: 'ham', label: 'GOLPE', rot: -1.2 },
  throw: { icon: 'ham', label: 'LANZAR', rot: -0.8 },
  dash: { icon: 'icon_dash', label: 'DASH' },
  smoke: { icon: 'icon_smoke', label: 'HUMO' },
  item: { icon: 'item_barrier', label: 'OBJETO' },
  disguise: { icon: 'prop_0_0', label: 'DISFRAZ' },
  none: { icon: 'icon_dash', label: '' },
};

const INFECTED_GREEN = 0x9cff5a;

export class UIScene extends Phaser.Scene {
  private game_!: GameScene;
  private g!: Phaser.GameObjects.Graphics;
  private dyn!: Phaser.GameObjects.Graphics;
  private mm!: Phaser.GameObjects.Graphics;
  private timer!: Phaser.GameObjects.BitmapText;
  private aliveText!: Phaser.GameObjects.BitmapText;
  private hpText!: Phaser.GameObjects.BitmapText;
  private row2Label!: Phaser.GameObjects.BitmapText;
  private slotKeys: Phaser.GameObjects.BitmapText[] = [];
  private slotIcons: Phaser.GameObjects.Image[] = [];
  private bootText!: Phaser.GameObjects.BitmapText;
  private shieldIcon!: Phaser.GameObjects.Image;
  private bootIcon!: Phaser.GameObjects.Image;
  private feed: FeedLine[] = [];
  private center!: Phaser.GameObjects.BitmapText;
  private centerSub!: Phaser.GameObjects.BitmapText;
  private ghostHint!: Phaser.GameObjects.BitmapText;
  private hiddenHint!: Phaser.GameObjects.BitmapText;
  private trapHint!: Phaser.GameObjects.BitmapText;
  private flash!: Phaser.GameObjects.Rectangle;
  private vignette!: Phaser.GameObjects.Graphics;
  private t = 0;
  private team: Team = 'escapist';
  /** Tamaño lógico de la pantalla (el HUD se ancla a los bordes). */
  private W = 480;
  private H = 270;
  private mmScale = 2;
  private wheel: Phaser.GameObjects.Container | null = null;
  private wheelItems: Phaser.GameObjects.BitmapText[] = [];
  private wheelSel = 0;
  private pingText!: Phaser.GameObjects.BitmapText;
  private roleText!: Phaser.GameObjects.BitmapText;
  private slotLabels: Phaser.GameObjects.BitmapText[] = [];
  private slotAbility: Ability[] = [];
  private mode: ModeId = 'pilla';
  private hype!: HypeOverlay;
  private spinText!: Phaser.GameObjects.BitmapText;
  private effectText!: Phaser.GameObjects.BitmapText;
  private modeText!: Phaser.GameObjects.BitmapText;
  private blind!: Phaser.GameObjects.Rectangle;
  private blindText!: Phaser.GameObjects.BitmapText;
  private dark: Phaser.GameObjects.RenderTexture | null = null;
  private lightRound!: Phaser.GameObjects.Image;
  private lightCone!: Phaser.GameObjects.Image;
  /** La casa: habitaciones con la luz encendida (se borran de la oscuridad). */
  private roomLight: Phaser.GameObjects.Graphics | null = null;
  private bombWarn!: Phaser.GameObjects.BitmapText;
  private fuseT = 0;
  private lastTempo = 1;
  /** La rueda de frases está abierta (el juego no lee acciones mientras tanto). */
  wheelOpen = false;

  constructor() {
    super('UI');
  }

  create(): void {
    this.game_ = this.scene.get('Game') as GameScene;
    const p = this.game_.player;
    this.team = p.team;
    this.feed = [];
    this.slotKeys = [];
    this.slotIcons = [];
    this.slotLabels = [];
    this.slotAbility = [];
    this.wheel = null;
    this.wheelOpen = false;
    this.dark = null;
    this.roomLight = null;
    this.mode = this.game_.model.mode;
    const info = modeInfo(this.mode);
    const chaser = this.team === 'chaser';
    const { Z, W, H } = viewSize(this);
    this.W = W;
    this.H = H;
    const cam = this.cameras.main;
    cam.setOrigin(0, 0).setZoom(Z).setScroll(0, 0);
    const onResize = () => this.scene.restart();
    this.scale.once(Phaser.Scale.Events.RESIZE, onResize);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.scale.off(Phaser.Scale.Events.RESIZE, onResize));
    const VIEW_W = W;
    const VIEW_H = H;
    const TC = TEAM_COLORS[this.team];

    // Noche (Infección y Escondite): oscuridad con luces y linternas.
    if (info.night) {
      this.dark = this.add.renderTexture(0, 0, W, H).setOrigin(0).setDepth(-50);
      this.lightRound = this.make.image({ key: 'light_round', add: false });
      this.lightCone = this.make.image({ key: 'light_cone', add: false }).setOrigin(0, 0.5);
      this.roomLight = houseLayout(this.game_.model.grid) ? this.make.graphics({}, false) : null;
    }
    this.vignette = this.add.graphics();
    this.g = this.add.graphics();
    // panel superior izquierdo
    panel(this.g, 4, 4, 132, 38);
    this.roleText = text(this, 9, 11, `${TC.role} ${TC.team}`, { origin: [0, 0.5], color: TC.light });
    if (chaser && this.mode === 'pilla') this.add.image(112, 11, 'icon_skull');
    this.row2Label = text(this, 131, 11, '', { origin: [1, 0.5] });
    if (chaser && this.mode === 'pilla') text(this, 12, 22, '→', { color: 0xfee761 });
    else this.add.image(12, 22, 'icon_heart');
    this.hpText = text(this, 131, 22, '', { origin: [1, 0.5] });
    this.add.image(12, 33, 'icon_bolt');
    this.hype = new HypeOverlay(this, W, H, 4, 45);

    // temporizador
    panel(this.g, VIEW_W / 2 - 34, 3, 68, 22);
    this.add.image(VIEW_W / 2 - 24, 14, 'icon_clock');
    this.timer = text(this, VIEW_W / 2 + 6, 14, '0:00', { scale: 2 });
    this.aliveText = text(this, VIEW_W / 2, 32, '', { color: TEAM_COLORS.escapist.light });
    this.pingText = text(this, VIEW_W - 6, 8, '', { origin: [1, 0.5], color: UI.muted });

    // casillas de habilidad (cambian según el modo y el papel)
    const b = settings.bindings;
    const keys = [b.action, b.special, b.sprint, b.rotate];
    const nSlots = this.mode === 'escondite' ? 4 : 3;
    for (let i = 0; i < nSlots; i++) {
      const x = 8 + i * 40;
      const y = VIEW_H - 40;
      panel(this.g, x, y, 28, 28, UI.panelDark);
      this.slotIcons.push(this.add.image(x + 14, y + 14, i === 2 ? 'icon_bolt' : 'icon_dash'));
      this.slotKeys.push(text(this, x + 14, y + 33, keyName(keys[i]).replace(' IZQ', '').replace(' DER', ''), { color: UI.muted }));
      this.slotLabels.push(text(this, x + 14, VIEW_H - 46, i === 2 ? 'SPRINT' : i === 3 ? 'GIRAR' : '', { color: UI.text }));
      this.slotAbility.push('none');
    }
    if (nSlots === 4) this.slotIcons[3].setTexture('icon_dash').setRotation(Math.PI / 2);
    this.refreshSlots();
    this.spinText = text(this, 8, VIEW_H - 58, '', { origin: [0, 0.5], color: 0xffd23f });
    this.effectText = text(this, VIEW_W / 2, 112, '', { color: 0xff7ab8 });
    this.modeText = text(this, VIEW_W / 2, VIEW_H / 2 + 50, '', { color: 0xfee761 });
    this.bombWarn = text(this, VIEW_W / 2, 62, '', { color: 0xff5a5a, scale: 2 });

    // estados
    this.shieldIcon = this.add.image(144, 12, 'item_shield').setVisible(false);
    this.bootIcon = this.add.image(144, 30, 'item_boot').setVisible(false);
    this.bootText = text(this, 154, 30, '', { origin: [0, 0.5], color: 0xfee761 });

    // minimapa
    this.mmScale = this.game_.map.miniScale;
    const mw = this.game_.map.grid.w * this.mmScale;
    const mh = this.game_.map.grid.h * this.mmScale;
    const mx = VIEW_W - mw - 6;
    const my = VIEW_H - mh - 6;
    panel(this.g, mx - 2, my - 2, mw + 4, mh + 4, UI.panelDark);
    this.add.image(mx, my, 'mini_' + this.game_.map.id).setOrigin(0).setAlpha(0.9);
    this.mm = this.add.graphics();
    this.mm.setPosition(mx, my);

    this.dyn = this.add.graphics();
    this.center = text(this, VIEW_W / 2, VIEW_H / 2 - 30, '', { scale: 4 });
    this.centerSub = text(this, VIEW_W / 2, VIEW_H / 2 + 2, '', { scale: 2 });
    this.ghostHint = text(this, VIEW_W / 2, VIEW_H - 12, `FANTASMA · MOVERTE · ${keyName(settings.bindings.action)}: CAMBIAR CÁMARA`, {
      color: 0xc2c3c7,
    }).setVisible(false);
    this.hiddenHint = text(this, VIEW_W / 2, VIEW_H - 12, 'ESCONDIDO EN EL ARBUSTO', { color: 0x63c74d }).setVisible(false);
    this.trapHint = text(this, VIEW_W / 2, VIEW_H / 2 + 34, '', { color: 0xfee761 }).setVisible(false);
    text(this, VIEW_W / 2, VIEW_H - 24, `${keyName(settings.bindings.talk)}: FRASES`, { color: UI.muted }).setAlpha(0.7);
    this.flash = this.add.rectangle(0, 0, VIEW_W, VIEW_H, 0xe43b44, 0).setOrigin(0);
    // Fase de esconderse: los buscadores no ven nada.
    this.blind = this.add.rectangle(0, 0, VIEW_W, VIEW_H, 0x05040a, 1).setOrigin(0).setDepth(90).setVisible(false);
    this.blindText = text(this, VIEW_W / 2, VIEW_H / 2, '', { scale: 2, color: 0xfee761 }).setDepth(91).setVisible(false);

    const ev = this.game_.events;
    const onCountdown = (n: number) => this.onCountdown(n);
    const onAnnounce = (s: string, c: number, big: boolean) => this.announce(s, c, big);
    const onFeed = (s: string, c: number) => this.addFeed(s, c);
    const onEnd = (w: Team, won: boolean) => this.onEnd(w, won);
    const onHit = (victim: SimChar) => {
      if (victim.id === this.game_.model.playerId) {
        this.flash.setFillStyle(0xe43b44, 0.35);
        this.tweens.add({ targets: this.flash, fillAlpha: 0, duration: 260 });
      }
    };
    const onFlash = (color: number, a: number) => {
      this.flash.setFillStyle(color, a);
      this.tweens.add({ targets: this.flash, fillAlpha: 0, duration: 400 });
    };
    const onCoin = (n: number, combo: number) => this.hype.addCoins(n, combo);
    const onRoulette = (kind: 'global' | 'me', r: number, title: string) => this.hype.roulette(kind, r, title);
    const onMedal = (m: string) => this.hype.medal(m);
    const onBurst = (n: number) => this.hype.burst(this.W / 2, this.H / 2, n);
    const handlers: [string, (...a: never[]) => void][] = [
      ['countdown', onCountdown],
      ['announce', onAnnounce],
      ['feed', onFeed],
      ['end', onEnd],
      ['hit', onHit],
      ['flash', onFlash],
      ['coin', onCoin],
      ['roulette', onRoulette],
      ['medal', onMedal],
      ['burst', onBurst],
    ];
    for (const [k, f] of handlers) ev.on(k, f);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      for (const [k, f] of handlers) ev.off(k, f);
    });
    this.addFeed(this.introLine(), TC.light);
  }

  private countdownLine(): string {
    const hunter = this.game_.player.team === 'chaser';
    switch (this.mode) {
      case 'infeccion':
        return hunter ? 'TIENES HAMBRE DE JAMÓN...' : '¡HAY UN INFECTADO ENTRE VOSOTROS!';
      case 'bomba':
        return '¡ALGUIEN VA A LLEVAR EL JAMÓN!';
      case 'escondite':
        return hunter ? 'CIERRA LOS OJOS Y CUENTA...' : '¡PREPÁRATE PARA ESCONDERTE!';
      default:
        return hunter ? 'PREPARA EL JAMÓN...' : '¡LOS AZULES VAN A SALIR!';
    }
  }

  private introLine(): string {
    const p = this.game_.player;
    switch (this.mode) {
      case 'infeccion':
        return p.team === 'chaser' ? '¡ERES EL PACIENTE CERO! CONTAGIA A TODOS' : '¡QUE NO TE TOQUE EL INFECTADO!';
      case 'bomba':
        return '¡PASA EL JAMÓN ANTES DE QUE EXPLOTE!';
      case 'escondite':
        return p.team === 'chaser' ? 'CUENTA HASTA 30... Y A BUSCAR' : '¡ESCÓNDETE! PULSA E';
      default:
        return p.team === 'chaser' ? '¡A POR LOS ROJOS!' : '¡QUE NO TE PILLEN LOS AZULES!';
    }
  }

  /** Nombre del papel y color según el modo. */
  private role(p: SimChar): { label: string; color: number } {
    switch (this.mode) {
      case 'infeccion':
        return p.team === 'chaser' ? { label: 'INFECTADO', color: INFECTED_GREEN } : { label: 'SUPERVIVIENTE', color: TEAM_COLORS.escapist.light };
      case 'bomba':
        return p.bomb ? { label: '¡LLEVAS EL JAMÓN!', color: 0xff5a5a } : { label: 'JAMÓN BOMBA', color: 0xfeae34 };
      case 'escondite':
        return p.team === 'chaser' ? { label: 'BUSCADOR', color: TEAM_COLORS.chaser.light } : { label: 'ESCONDIDO', color: TEAM_COLORS.escapist.light };
      default: {
        const TC = TEAM_COLORS[p.team];
        return { label: `${TC.role} ${TC.team}`, color: TC.light };
      }
    }
  }

  /** Actualiza iconos y nombres de las casillas según lo que hace cada botón ahora. */
  private refreshSlots(): void {
    const p = this.game_.player;
    for (let i = 0; i < 2; i++) {
      const a = abilityFor(this.mode, p, i === 0 ? 'action' : 'special');
      let icon = ABILITY_UI[a].icon;
      let label = ABILITY_UI[a].label;
      if (a === 'item') {
        icon = p.heldItem ? `item_${p.heldItem}` : 'item_grenade';
        label = p.heldItem === 'barrier' ? 'BARRERA' : p.heldItem === 'grenade' ? 'GRANADA' : 'VACÍO';
      }
      if (a === 'disguise' && p.disguise >= 0) {
        icon = `prop_${p.disguise}_${p.rot}`;
        label = 'CAMBIAR';
      }
      if (a !== this.slotAbility[i] || this.slotIcons[i].texture.key !== icon || this.slotIcons[i].visible !== (a !== 'none')) {
        this.slotAbility[i] = a;
        this.slotIcons[i].setTexture(icon).setRotation(ABILITY_UI[a].rot ?? 0).setVisible(a !== 'none');
        this.slotLabels[i].setText(fontText(label));
      }
    }
    if (this.slotLabels[2]) this.slotLabels[2].setText(fontText(this.mode === 'escondite' && p.disguise >= 0 ? 'QUIETO' : 'SPRINT'));
  }

  private onCountdown(n: number): void {
    this.tweens.killTweensOf(this.center);
    if (n > 0) {
      audio.play('count');
      this.center.setText(String(n)).setTint(0xfee761).setAlpha(1).setScale(6);
      this.tweens.add({ targets: this.center, scale: 4, duration: 250, ease: 'Back.easeOut' });
      this.centerSub.setText(fontText(this.countdownLine())).setTint(UI.text).setAlpha(1);
    } else {
      audio.play('go');
      this.center.setText(fontText('¡YA!')).setTint(0x63c74d).setAlpha(1).setScale(6);
      this.centerSub.setAlpha(0);
      this.tweens.add({ targets: this.center, scale: 4, duration: 200, ease: 'Back.easeOut' });
      this.tweens.add({ targets: this.center, alpha: 0, delay: 600, duration: 300 });
    }
  }

  private announce(s: string, color: number, big: boolean): void {
    if (this.game_.model.state === 'ended') return;
    this.tweens.killTweensOf(this.centerSub);
    this.centerSub.setText(fontText(s)).setTint(color).setAlpha(1).setScale(big ? 3 : 1);
    this.tweens.add({ targets: this.centerSub, scale: big ? 2 : 1, duration: 200, ease: 'Back.easeOut' });
    this.tweens.add({ targets: this.centerSub, alpha: 0, delay: 1600, duration: 400 });
  }

  private addFeed(s: string, color: number): void {
    const t = this.add.bitmapText(this.W - 6, 0, FONT, fontText(s)).setOrigin(1, 0).setTint(color);
    this.feed.unshift({ t, life: 3.2 });
    while (this.feed.length > 6) this.feed.pop()!.t.destroy();
  }

  private onEnd(winner: Team, won: boolean, sub?: string): void {
    this.tweens.killTweensOf(this.center);
    this.tweens.killTweensOf(this.centerSub);
    const color = TEAM_COLORS[winner].light;
    this.center.setText(fontText(won ? '¡VICTORIA!' : 'DERROTA')).setTint(won ? 0xfee761 : 0xc2c3c7).setAlpha(1).setScale(6);
    this.tweens.add({ targets: this.center, scale: 4, duration: 300, ease: 'Back.easeOut' });
    const info = modeInfo(this.mode);
    const def = this.mode === 'pilla' ? (winner === 'chaser' ? 'GANA EL EQUIPO AZUL' : 'GANA EL EQUIPO ROJO') : `GANAN LOS ${winner === 'chaser' ? info.hunters : info.prey}`;
    this.centerSub
      .setText(fontText(sub ?? def))
      .setTint(color)
      .setAlpha(1)
      .setScale(2);
    if (won) this.hype.burst(this.W / 2, this.H / 2 - 30, 80);
  }

  update(_time: number, delta: number): void {
    const dt = delta / 1000;
    this.t += dt;
    const gs = this.game_;
    if (!gs || !gs.model) return;
    const model = gs.model;
    const p = gs.player;
    const chaser = p.isChaser;
    const VIEW_W = this.W;
    const VIEW_H = this.H;
    this.updateWheel();
    const ping = (model as unknown as { ping?: number }).ping;
    this.pingText.setText(model.online && ping !== undefined ? `PING ${Math.round(ping)} MS` : '');

    // feed (debajo de la fila superior para no tapar el reloj)
    let fy = 48;
    for (const f of this.feed) {
      f.life -= dt;
      f.t.setY(fy);
      f.t.setAlpha(Math.min(1, f.life * 2));
      fy += 10;
    }
    this.feed = this.feed.filter((f) => {
      if (f.life <= 0) f.t.destroy();
      return f.life > 0;
    });

    const ms = model.modeNet();
    const mode = this.mode;
    // temporizador (en Jamón Bomba, la ronda)
    const sec = Math.ceil(model.timeLeft);
    if (mode === 'bomba') {
      this.timer.setText(fontText(`R${ms.r}`));
      this.timer.setTint(UI.text);
    } else {
      const m = Math.floor(sec / 60);
      const s = sec % 60;
      this.timer.setText(`${m}:${s.toString().padStart(2, '0')}`);
      const urgent = sec <= 10 && model.state === 'play';
      this.timer.setTint(urgent ? (Math.floor(this.t * 4) % 2 ? 0xe43b44 : 0xffffff) : UI.text);
    }

    const role = this.role(p);
    this.roleText.setText(fontText(role.label)).setTint(role.color);
    this.refreshSlots();

    // Quién cuenta como "presa" en la fila de puntitos.
    const escs = mode === 'bomba' ? model.chars : model.chars.filter((c) => (mode === 'infeccion' ? true : !c.isChaser));
    const alive = escs.filter((c) => c.free && (mode !== 'infeccion' || c.team === 'escapist')).length;
    const trappedN = escs.filter((c) => c.trapped > 0).length;
    let line = '';
    if (mode === 'pilla') line = `LIBRES ${alive}/${escs.length}${trappedN ? ` · ATRAPADOS ${trappedN}` : ''}`;
    else if (mode === 'infeccion') line = `SUPERVIVIENTES ${ms.n}/${ms.tot}`;
    else if (mode === 'bomba') line = ms.ph === 1 && model.state === 'play' ? `VIVOS ${ms.n} · NUEVA RONDA EN ${Math.ceil(ms.pt / 10)}` : `VIVOS ${ms.n}/${ms.tot}`;
    else line = ms.ph === 0 ? `ESCONDIDOS ${ms.n}/${ms.tot}` : `ESCONDIDOS ${ms.n}/${ms.tot} · PISTA EN ${ms.nh}S`;
    this.aliveText.setText(fontText(line));

    const d = this.dyn;
    d.clear();
    // puntitos de las presas
    const total = escs.length;
    const startX = VIEW_W / 2 - (total * 7) / 2 + 3;
    escs.forEach((c, i) => {
      const x = Math.round(startX + i * 7);
      const y = 40;
      d.fillStyle(0x0d0b14, 1).fillRect(x - 3, y - 3, 6, 6);
      let col = !c.alive
        ? 0x3a4466
        : c.trapped > 0
          ? Math.floor(this.t * 4) % 2
            ? 0xfeae34
            : 0x8a5a20
          : c.id === model.playerId
            ? 0xfee761
            : TEAM_COLORS.escapist.main;
      if (mode === 'infeccion' && c.alive && c.team === 'chaser') col = c.id === model.playerId ? 0xe6ff5a : 0x3e8948;
      if (mode === 'bomba' && c.alive && c.bomb) col = Math.floor(this.t * 6) % 2 ? 0xff5a5a : 0xfeae34;
      d.fillStyle(col, 1).fillRect(x - 2, y - 2, 4, 4);
    });

    this.updateModeHud(dt, ms, p);

    // fila 2 y barras
    if (mode === 'escondite' && chaser) {
      this.row2Label.setText(String(p.stats.finds));
      this.hpText.setText(String(Math.ceil(p.hp)));
      const ratio = p.hp / MODES.escondite.seekerHp;
      const col = ratio > 0.5 ? 0x7cc8ff : ratio > 0.25 ? 0xfeae34 : 0xe43b44;
      this.bar(d, 20, 19, 88, 6, ratio, col, 0x1d2a44);
      this.hpText.setTint(col);
    } else if (mode === 'infeccion' || mode === 'bomba') {
      this.row2Label.setText(mode === 'infeccion' && chaser ? String(p.stats.infections) : '');
      this.hpText.setText(fontText(mode === 'bomba' ? `RONDA ${ms.r}` : chaser ? 'CONTAGIA' : 'CORRE'));
      this.hpText.setTint(mode === 'infeccion' && chaser ? INFECTED_GREEN : UI.text);
      this.bar(d, 20, 19, 60, 6, 1, mode === 'infeccion' && chaser ? 0x3e8948 : 0x63c74d, 0x5a2030);
    } else if (chaser) {
      this.row2Label.setText(String(p.stats.eliminations));
      // impulso en línea recta (los perseguidores aceleran si no giran)
      const bonus = Math.min(1, p.straightTime / BALANCE.chaser.straightBonusTime);
      this.hpText.setText(`+${Math.round(bonus * BALANCE.chaser.straightBonusMax * 100)}%`);
      this.hpText.setTint(bonus > 0.05 ? 0xfee761 : UI.muted);
      this.bar(d, 20, 19, 80, 6, bonus, 0xfee761, 0x3a3020);
    } else {
      this.row2Label.setText('');
      this.hpText.setText(String(Math.ceil(p.hp)));
      const ratio = p.hp / p.maxHp;
      const col = ratio > 0.5 ? 0x63c74d : ratio > 0.25 ? 0xfeae34 : 0xe43b44;
      this.bar(d, 20, 19, 88, 6, ratio, col, 0x5a2030);
      this.hpText.setTint(col);
    }
    const eRatio = p.energy / p.energyMax;
    const exhausted = p.exhaustTimer > 0;
    this.bar(d, 20, 31, 88, 4, eRatio, exhausted ? 0x8b9bb4 : 0x7cc8ff, 0x1d2a44);

    // cooldowns
    const readies = [p.actionReady(this.slotAbility[0]), p.specialReady(this.slotAbility[1]), p.exhaustTimer > 0 ? 0 : p.energy / p.energyMax, p.disguise >= 0 ? 1 : 0.3];
    readies.slice(0, this.slotIcons.length).forEach((r, i) => {
      const x = 8 + i * 40;
      const y = VIEW_H - 40;
      if (r < 1) {
        const h = Math.round(26 * (1 - r));
        d.fillStyle(0x000000, 0.6).fillRect(x + 1, y + 1, 26, h);
        this.slotIcons[i].setAlpha(0.5);
      } else {
        this.slotIcons[i].setAlpha(1);
        if (Math.floor(this.t * 3) % 6 === 0) d.lineStyle(1, 0xfee761, 0.8).strokeRect(x + 0.5, y + 0.5, 27, 27);
      }
    });

    // estados
    this.shieldIcon.setVisible(p.shield && p.alive);
    const boot = p.bootTime > 0 && p.alive;
    this.bootIcon.setVisible(boot);
    this.bootText.setText(boot ? `${Math.ceil(p.bootTime)}S` : '');

    // viñeta de vida baja
    this.vignette.clear();
    if (p.bomb && p.alive) {
      const u = ms.b[ms.b.indexOf(p.id) + 1] ?? 0;
      const a = 0.25 + Math.sin(this.t * (6 + u * 8)) * 0.15;
      const w = 4 + u * 3;
      this.vignette.fillStyle(0xff3a3a, a);
      this.vignette.fillRect(0, 0, VIEW_W, w).fillRect(0, VIEW_H - w, VIEW_W, w).fillRect(0, 0, w, VIEW_H).fillRect(VIEW_W - w, 0, w, VIEW_H);
    } else if (mode !== 'infeccion' && mode !== 'bomba' && !(mode === 'pilla' && chaser) && p.alive && p.hp <= 25) {
      const a = 0.25 + Math.sin(this.t * 6) * 0.12;
      this.vignette.fillStyle(0xe43b44, a);
      this.vignette.fillRect(0, 0, VIEW_W, 4).fillRect(0, VIEW_H - 4, VIEW_W, 4).fillRect(0, 0, 4, VIEW_H).fillRect(VIEW_W - 4, 0, 4, VIEW_H);
    }

    this.ghostHint.setVisible(!p.alive && model.state === 'play');
    this.trapHint.setVisible(p.trapped > 0 && model.state === 'play');
    if (p.trapped > 0)
      this.trapHint.setText(
        fontText(p.rescueProg > 0 ? `¡TE ESTÁN RESCATANDO! ${Math.round(p.rescueProg * 100)}%` : `ENJAMONADO · ${Math.ceil(p.trapped)} S PARA QUE TE RESCATEN`),
      );
    this.hiddenHint.setVisible(p.alive && p.inBush && model.state === 'play' && p.disguise < 0);
    if (this.mode === 'escondite' && p.alive && !chaser && model.state === 'play') {
      this.hiddenHint
        .setText(fontText(p.disguise >= 0 ? (p.anchored ? 'ANCLADO' : 'SHIFT: QUIETO') : `${keyName(settings.bindings.special)}: DISFRAZ`))
        .setTint(p.disguise >= 0 ? 0x63c74d : 0xfee761)
        .setVisible(true);
    }

    this.drawMinimap();
    this.drawDarkness();
    this.hype.update(dt);
  }

  /** Avisos propios de cada modo: fase de esconderse, jamón bomba, último superviviente, ruleta... */
  private updateModeHud(dt: number, ms: ReturnType<GameScene['model']['modeNet']>, p: SimChar): void {
    const model = this.game_.model;
    const playing = model.state === 'play';
    // Escondite: cuenta atrás para esconderse; los buscadores, a oscuras.
    const hiding = this.mode === 'escondite' && ms.ph === 0 && model.state !== 'ended';
    const blindNow = hiding && p.team === 'chaser';
    this.blind.setVisible(blindNow);
    this.blindText.setVisible(hiding);
    if (hiding) {
      const left = Math.ceil(ms.pt / 10);
      this.blindText
        .setText(fontText(blindNow ? `CONTANDO... ${left}` : `¡ESCÓNDETE! ${left}`))
        .setPosition(this.W / 2, blindNow ? this.H / 2 : 74)
        .setScale(blindNow ? 3 : 2)
        .setTint(left <= 5 ? 0xff5a5a : 0xfee761);
    }
    // Jamón bomba: ¿lo llevas tú? ¿quién lo lleva?
    if (this.mode === 'bomba' && playing) {
      if (p.bomb) {
        this.bombWarn.setText(fontText('¡TIENES EL JAMÓN! ¡PÁSALO!')).setVisible(true).setScale(2 + Math.sin(this.t * 10) * 0.15);
      } else this.bombWarn.setVisible(false);
      // Sonido de mecha que se acelera.
      let maxU = -1;
      for (let i = 1; i < ms.b.length; i += 2) maxU = Math.max(maxU, ms.b[i]);
      if (maxU >= 0) {
        this.fuseT -= dt;
        if (this.fuseT <= 0) {
          this.fuseT = maxU === 2 ? 0.09 : maxU === 1 ? 0.22 : 0.45;
          audio.play('fuse');
          if (maxU === 2 && p.bomb) audio.play('tick');
        }
      }
    } else this.bombWarn.setVisible(false);
    // Infección: la música se acelera según quedan menos supervivientes.
    if (this.mode === 'infeccion' && playing && ms.tot > 0) {
      const k = 1 + (1 - ms.n / ms.tot) * 0.45;
      if (Math.abs(k - this.lastTempo) > 0.02) {
        this.lastTempo = k;
        audio.setTempo(k);
      }
    }
    // Efecto global de la ruleta activo.
    this.effectText.setText(ms.fx ? fontText(`${GLOBAL_LABELS[ms.fx] ?? ms.fx} ${ms.ft}S`) : '').setTint(Math.floor(this.t * 4) % 2 ? 0xff7ab8 : 0xfee761);
    // Tirada personal disponible.
    const canSpin = playing && p.alive && p.spinsLeft > 0 && model.matchTime >= HYPE.personalFrom;
    this.spinText
      .setText(canSpin ? fontText(`${keyName(settings.bindings.spin)}: ¡RULETA!`) : '')
      .setScale(canSpin ? 1 + Math.max(0, Math.sin(this.t * 5)) * 0.15 : 1);
    this.modeText.setText('');
  }

  /** Oscuridad de los modos nocturnos: capa negra con agujeros de luz. */
  private drawDarkness(): void {
    const rt = this.dark;
    if (!rt) return;
    const gs = this.game_;
    const model = gs.model;
    const v = gs.cameras.main.worldView;
    const viewer = gs.player;
    rt.clear();
    rt.fill(0x05040c, this.mode === 'escondite' ? 0.86 : 0.74);
    const L = this.lightRound;
    const put = (x: number, y: number, r: number) => {
      const sx = x - v.x;
      const sy = y - v.y;
      if (sx < -r || sy < -r || sx > this.W + r || sy > this.H + r) return;
      L.setPosition(sx, sy).setScale(r / 64);
      rt.erase(L);
    };
    // La casa: las habitaciones con la luz encendida se ven (casi) como de día.
    const house = this.roomLight ? houseLayout(model.grid) : null;
    if (house && this.roomLight) {
      const g = this.roomLight.clear().fillStyle(0xffffff, 1);
      const lt = model.modeNet().lt;
      const T = 16;
      house.rooms.forEach((room, ri) => {
        if (!lightOn(lt, ri)) return;
        for (const [x, y, w, h] of room.rects) {
          const sx = x * T - v.x;
          const sy = y * T - v.y;
          if (sx > this.W || sy > this.H || sx + w * T < 0 || sy + h * T < 0) continue;
          // Un poco más grande para que se vean también las paredes de la habitación.
          g.fillRect(sx - 4, sy - 10, w * T + 8, h * T + 14);
        }
      });
      rt.erase(g);
    }
    // farolas del mapa (objetos de verdad)
    for (const pr of model.props) if (pr.k === 1) put(pr.x, pr.y - 14, 38);
    for (const c of model.chars) {
      if (!c.alive) continue;
      const me = c === viewer;
      if (c.disguise >= 0 && !me) continue;
      put(c.x, c.y - 6, me ? 70 : this.mode === 'infeccion' && c.team === 'chaser' ? 22 : 30);
      // Linterna de los buscadores (y de los supervivientes).
      if ((this.mode === 'escondite' && c.team === 'chaser') || (this.mode === 'infeccion' && c.team === 'escapist')) {
        const len = this.mode === 'escondite' ? 1 : 0.7;
        this.lightCone.setPosition(c.x - v.x, c.y - 6 - v.y).setRotation(Math.atan2(c.fy, c.fx)).setScale(len);
        rt.erase(this.lightCone);
      }
    }
    if (!viewer.alive) put(viewer.x, viewer.y, 90);
  }

  // ------------------------------------------------------------------ rueda de frases (T)

  private updateWheel(): void {
    const gs = this.game_;
    if (input.justPressed('talk') && gs.player.alive !== undefined) {
      if (this.wheelOpen) this.closeWheel();
      else this.openWheel();
      return;
    }
    if (!this.wheelOpen) return;
    const ids = this.wheelIds();
    // 1-8 eligen directamente; ESPACIO/A confirma; E/X pasa a la siguiente
    for (let i = 0; i < ids.length; i++) {
      if (input.keyPressed(`Digit${i + 1}`) || input.keyPressed(`Numpad${i + 1}`)) {
        this.pickPhrase(i);
        return;
      }
    }
    if (input.justPressed('special')) this.setWheelSel((this.wheelSel + 1) % ids.length);
    if (input.justPressed('action')) this.pickPhrase(this.wheelSel);
    if (input.justPressed('pause')) this.closeWheel();
  }

  private openWheel(): void {
    audio.play('hover');
    this.wheelOpen = true;
    const ids = this.wheelIds();
    const cx = this.W / 2;
    const cy = this.H / 2 - 6;
    const R = 62;
    const c = this.add.container(0, 0).setDepth(100);
    const g = this.add.graphics();
    g.fillStyle(0x0d0b14, 0.55).fillCircle(cx, cy, R + 26);
    g.lineStyle(1, TEAM_COLORS[this.game_.player.team].light, 0.8).strokeCircle(cx, cy, R + 26);
    c.add(g);
    c.add(text(this, cx, cy, 'FRASES', { color: UI.focusLight }));
    c.add(text(this, cx, cy + 10, '1-8 · CLIC', { color: UI.muted }));
    this.wheelItems = ids.map((pid, i) => {
      const a = -Math.PI / 2 + (i / ids.length) * Math.PI * 2;
      const t = text(this, cx + Math.cos(a) * R, cy + Math.sin(a) * (R * 0.72), `${i + 1}. ${PHRASES.list[pid]}`, { color: UI.text });
      t.setInteractive({ useHandCursor: true });
      t.on('pointerover', () => this.setWheelSel(i));
      t.on('pointerup', () => this.pickPhrase(i));
      c.add(t);
      return t;
    });
    this.wheel = c;
    this.setWheelSel(0);
  }

  private setWheelSel(i: number): void {
    this.wheelSel = i;
    this.wheelItems.forEach((t, k) => t.setTint(k === i ? UI.focusLight : UI.text));
  }

  private pickPhrase(i: number): void {
    const pid = this.wheelIds()[i];
    if (pid !== undefined) this.game_.model.say(pid);
    audio.play('click');
    this.closeWheel();
  }

  private wheelIds(): readonly number[] {
    const team = this.game_.player.team;
    if (this.mode === 'pilla') return PHRASES.wheel[team];
    return PHRASES.modeWheel[this.mode][team];
  }

  private closeWheel(): void {
    this.wheel?.destroy();
    this.wheel = null;
    this.wheelItems = [];
    this.wheelOpen = false;
  }

  private bar(g: Phaser.GameObjects.Graphics, x: number, y: number, w: number, h: number, ratio: number, color: number, back: number): void {
    g.fillStyle(0x0d0b14, 1).fillRect(x - 1, y - 1, w + 2, h + 2);
    g.fillStyle(back, 1).fillRect(x, y, w, h);
    const fw = Math.round(w * Phaser.Math.Clamp(ratio, 0, 1));
    g.fillStyle(color, 1).fillRect(x, y, fw, h);
    g.fillStyle(0xffffff, 0.3).fillRect(x, y, fw, 1);
  }

  private drawMinimap(): void {
    const gs = this.game_;
    const g = this.mm;
    g.clear();
    const k = this.mmScale / TILE;
    // vista de la cámara
    const v = gs.cameras.main.worldView;
    g.lineStyle(1, 0xffffff, 0.5).strokeRect(Math.round(v.x * k) + 0.5, Math.round(v.y * k) + 0.5, Math.round(v.width * k), Math.round(v.height * k));
    for (const pk of gs.model.pickups) {
      if (pk.dead) continue;
      g.fillStyle(PICKUP_COLORS[pk.type], 1).fillRect(Math.round(pk.x * k) - 1, Math.round(pk.y * k) - 1, 2, 2);
    }
    const viewer = gs.player;
    for (const c of gs.model.chars) {
      if (!c.alive || c.id === viewer.id) continue;
      if (c.team !== viewer.team && c.inBush && Math.hypot(c.x - viewer.x, c.y - viewer.y) > BALANCE.terrain.bushRevealDistance) continue;
      // En el Escondite, el radar no chiva a los del otro equipo; los invisibles no salen.
      if (this.mode === 'escondite' && c.team !== viewer.team && viewer.alive) continue;
      if (c.invisible > 0 && c.team !== viewer.team) continue;
      let col = c.isChaser ? TEAM_COLORS.chaser.light : c.trapped > 0 ? 0xfeae34 : TEAM_COLORS.escapist.main;
      if (this.mode === 'infeccion' && c.team === 'chaser') col = 0x63c74d;
      if (this.mode === 'bomba') col = c.bomb ? (Math.floor(this.t * 6) % 2 ? 0xff5a5a : 0xfeae34) : 0xffffff;
      g.fillStyle(0x0d0b14, 1).fillRect(Math.round(c.x * k) - 2, Math.round(c.y * k) - 2, 4, 4);
      g.fillStyle(col, 1).fillRect(Math.round(c.x * k) - 1, Math.round(c.y * k) - 1, 2, 2);
    }
    // Infección: los infectados ven al último superviviente cada pocos segundos.
    const ms = gs.model.modeNet();
    if (this.mode === 'infeccion' && ms.pg.length === 2 && viewer.team === 'chaser') {
      const r = 3 + (this.t * 6) % 6;
      g.lineStyle(1, 0xff5a5a, 1).strokeCircle(Math.round(ms.pg[0] * k), Math.round(ms.pg[1] * k), r);
      g.fillStyle(0xff5a5a, 1).fillRect(Math.round(ms.pg[0] * k) - 1, Math.round(ms.pg[1] * k) - 1, 3, 3);
    }
    if (Math.floor(this.t * 4) % 2 === 0 || !viewer.alive) {
      g.fillStyle(0x0d0b14, 1).fillRect(Math.round(viewer.x * k) - 2, Math.round(viewer.y * k) - 2, 5, 5);
      g.fillStyle(viewer.alive ? 0xfee761 : 0xc2c3c7, 1).fillRect(Math.round(viewer.x * k) - 1, Math.round(viewer.y * k) - 1, 3, 3);
    }
  }
}
