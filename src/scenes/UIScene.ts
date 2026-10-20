import Phaser from 'phaser';
import { BALANCE, PHRASES, TILE } from '../config/balance';
import { keyName, settings } from '../config/settings';
import { audio } from '../core/audio';
import { input } from '../core/input';
import type { SimChar } from '../../shared/sim/Char';
import { PICKUP_COLORS } from '../game/views';
import { FONT, fontText } from '../gfx/font';
import { Team } from '../gfx/characters';
import { TEAM_COLORS } from '../gfx/palette';
import { panel, text, UI } from '../ui/widgets';
import { viewSize } from './common';
import type { GameScene } from './GameScene';

interface FeedLine {
  t: Phaser.GameObjects.BitmapText;
  life: number;
}

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
    this.wheel = null;
    this.wheelOpen = false;
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

    this.vignette = this.add.graphics();
    this.g = this.add.graphics();
    // panel superior izquierdo
    panel(this.g, 4, 4, 132, 38);
    text(this, 9, 11, `${TC.role} ${TC.team}`, { origin: [0, 0.5], color: TC.light });
    if (chaser) this.add.image(112, 11, 'icon_skull');
    this.row2Label = text(this, 131, 11, '', { origin: [1, 0.5] });
    if (chaser) text(this, 12, 22, '→', { color: 0xfee761 });
    else this.add.image(12, 22, 'icon_heart');
    this.hpText = text(this, 131, 22, '', { origin: [1, 0.5] });
    this.add.image(12, 33, 'icon_bolt');

    // temporizador
    panel(this.g, VIEW_W / 2 - 34, 3, 68, 22);
    this.add.image(VIEW_W / 2 - 24, 14, 'icon_clock');
    this.timer = text(this, VIEW_W / 2 + 6, 14, '0:00', { scale: 2 });
    this.aliveText = text(this, VIEW_W / 2, 32, '', { color: TEAM_COLORS.escapist.light });
    this.pingText = text(this, 6, VIEW_H - 54, '', { origin: [0, 0.5], color: UI.muted });

    // casillas de habilidad
    const b = settings.bindings;
    const slots: [string, string][] = chaser
      ? [['ham', keyName(b.action)], ['ham', keyName(b.special)], ['icon_bolt', keyName(b.sprint)]]
      : [['icon_dash', keyName(b.action)], ['icon_smoke', keyName(b.special)], ['icon_bolt', keyName(b.sprint)]];
    slots.forEach(([icon, key], i) => {
      const x = 8 + i * 40;
      const y = VIEW_H - 40;
      panel(this.g, x, y, 28, 28, UI.panelDark);
      const img = this.add.image(x + 14, y + 14, icon);
      if (chaser && i === 1) img.setRotation(-0.8);
      if (chaser && i === 0) img.setRotation(-1.2);
      this.slotIcons.push(img);
      this.slotKeys.push(text(this, x + 14, y + 33, key.replace(' IZQ', '').replace(' DER', ''), { color: UI.muted }));
    });
    text(this, 8 + 14, VIEW_H - 46, chaser ? 'GOLPE' : 'DASH', { color: UI.text });
    text(this, 8 + 40 + 14, VIEW_H - 46, chaser ? 'LANZAR' : 'HUMO', { color: UI.text });
    text(this, 8 + 80 + 14, VIEW_H - 46, 'SPRINT', { color: UI.text });

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
    ev.on('countdown', onCountdown);
    ev.on('announce', onAnnounce);
    ev.on('feed', onFeed);
    ev.on('end', onEnd);
    ev.on('hit', onHit);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      ev.off('countdown', onCountdown);
      ev.off('announce', onAnnounce);
      ev.off('feed', onFeed);
      ev.off('end', onEnd);
      ev.off('hit', onHit);
    });
    this.addFeed(chaser ? '¡A POR LOS ROJOS!' : '¡QUE NO TE PILLEN LOS AZULES!', TC.light);
  }

  private onCountdown(n: number): void {
    this.tweens.killTweensOf(this.center);
    if (n > 0) {
      audio.play('count');
      this.center.setText(String(n)).setTint(0xfee761).setAlpha(1).setScale(6);
      this.tweens.add({ targets: this.center, scale: 4, duration: 250, ease: 'Back.easeOut' });
      this.centerSub.setText(fontText(this.team === 'chaser' ? 'PREPARA EL JAMÓN...' : '¡LOS AZULES VAN A SALIR!')).setTint(UI.text).setAlpha(1);
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

  private onEnd(winner: Team, won: boolean): void {
    this.tweens.killTweensOf(this.center);
    this.tweens.killTweensOf(this.centerSub);
    const color = TEAM_COLORS[winner].light;
    this.center.setText(fontText(won ? '¡VICTORIA!' : 'DERROTA')).setTint(won ? 0xfee761 : 0xc2c3c7).setAlpha(1).setScale(6);
    this.tweens.add({ targets: this.center, scale: 4, duration: 300, ease: 'Back.easeOut' });
    this.centerSub
      .setText(fontText(winner === 'chaser' ? 'GANA EL EQUIPO AZUL' : 'GANA EL EQUIPO ROJO'))
      .setTint(color)
      .setAlpha(1)
      .setScale(2);
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

    // feed
    let fy = 6;
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

    // temporizador
    const sec = Math.ceil(model.timeLeft);
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    this.timer.setText(`${m}:${s.toString().padStart(2, '0')}`);
    const urgent = sec <= 10 && model.state === 'play';
    this.timer.setTint(urgent ? (Math.floor(this.t * 4) % 2 ? 0xe43b44 : 0xffffff) : UI.text);

    const escs = model.chars.filter((c) => !c.isChaser);
    const alive = escs.filter((c) => c.free).length;
    const trappedN = escs.filter((c) => c.trapped > 0).length;
    this.aliveText.setText(fontText(`LIBRES ${alive}/${escs.length}${trappedN ? ` · ATRAPADOS ${trappedN}` : ''}`));

    const d = this.dyn;
    d.clear();
    // puntitos de escapistas
    const total = escs.length;
    const startX = VIEW_W / 2 - (total * 7) / 2 + 3;
    escs.forEach((c, i) => {
      const x = Math.round(startX + i * 7);
      const y = 40;
      d.fillStyle(0x0d0b14, 1).fillRect(x - 3, y - 3, 6, 6);
      const col = !c.alive
        ? 0x3a4466
        : c.trapped > 0
          ? Math.floor(this.t * 4) % 2
            ? 0xfeae34
            : 0x8a5a20
          : c.id === model.playerId
            ? 0xfee761
            : TEAM_COLORS.escapist.main;
      d.fillStyle(col, 1).fillRect(x - 2, y - 2, 4, 4);
    });

    // fila 2 y barras
    if (chaser) {
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
    const readies = [p.actionReady, p.specialReady, p.exhaustTimer > 0 ? 0 : p.energy / p.energyMax];
    readies.forEach((r, i) => {
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
    if (!chaser && p.alive && p.hp <= 25) {
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
    this.hiddenHint.setVisible(p.alive && p.inBush && model.state === 'play');

    this.drawMinimap();
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
    const ids = PHRASES.wheel[this.team];
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
    const ids = PHRASES.wheel[this.team];
    const cx = this.W / 2;
    const cy = this.H / 2 - 6;
    const R = 62;
    const c = this.add.container(0, 0).setDepth(100);
    const g = this.add.graphics();
    g.fillStyle(0x0d0b14, 0.55).fillCircle(cx, cy, R + 26);
    g.lineStyle(1, TEAM_COLORS[this.team].light, 0.8).strokeCircle(cx, cy, R + 26);
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
    const pid = PHRASES.wheel[this.team][i];
    if (pid !== undefined) this.game_.model.say(pid);
    audio.play('click');
    this.closeWheel();
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
      g.fillStyle(0x0d0b14, 1).fillRect(Math.round(c.x * k) - 2, Math.round(c.y * k) - 2, 4, 4);
      g.fillStyle(c.isChaser ? TEAM_COLORS.chaser.light : c.trapped > 0 ? 0xfeae34 : TEAM_COLORS.escapist.main, 1).fillRect(Math.round(c.x * k) - 1, Math.round(c.y * k) - 1, 2, 2);
    }
    if (Math.floor(this.t * 4) % 2 === 0 || !viewer.alive) {
      g.fillStyle(0x0d0b14, 1).fillRect(Math.round(viewer.x * k) - 2, Math.round(viewer.y * k) - 2, 5, 5);
      g.fillStyle(viewer.alive ? 0xfee761 : 0xc2c3c7, 1).fillRect(Math.round(viewer.x * k) - 1, Math.round(viewer.y * k) - 1, 3, 3);
    }
  }
}
