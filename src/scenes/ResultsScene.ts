import Phaser from 'phaser';
import { VIEW_H, VIEW_W } from '../config/balance';
import { account } from '../net/account';
import type { ApplyResult } from '../../shared/economy';
import { audio } from '../core/audio';
import { input } from '../core/input';
import { HYPE, levelFor } from '../../shared/balance';
import { modeInfo } from '../../shared/modes/rules';
import { FONT, fontText } from '../gfx/font';
import { Button, Menu, panel, text, UI } from '../ui/widgets';
import { TEAM_COLORS } from '../gfx/palette';
import { Backdrop, fadeIn, fadeTo } from './common';
import { net } from '../net/NetClient';
import type { ResultEntry, ResultsData } from './GameScene';
import { MODE_COLORS } from './ModeSelectScene';

function mmss(s: number): string {
  const t = Math.floor(s);
  return `${Math.floor(t / 60)}:${(t % 60).toString().padStart(2, '0')}`;
}

/** Lo más destacado de cada jugador según el modo (para la tabla). */
function statLine(mode: string, e: ResultEntry, short: boolean): string {
  const s = e.stats;
  switch (mode) {
    case 'infeccion':
      return e.team === 'chaser' ? (short ? `${s.infections} INF` : `CONTAGIOS ${s.infections}`) : short ? 'VIVO' : `VIVO · ${mmss(s.timeSurvived)}`;
    case 'bomba':
      return short ? `R${s.rounds} P${s.passes}` : `RONDAS ${s.rounds} · PASES ${s.passes}`;
    case 'escondite':
      return e.team === 'chaser' ? (short ? `${s.finds} ENC` : `ENCONTRADOS ${s.finds} · FALLOS ${s.misses}`) : e.alive ? 'NO ENCONTRADO' : `FUERA ${mmss(s.timeSurvived)}`;
    default:
      return e.team === 'chaser' ? (short ? `${s.eliminations}P` : `PILLADOS ${s.eliminations}`) : e.alive ? (short ? 'VIVO' : `VIVO · RESC ${s.rescues}`) : mmss(s.timeSurvived);
  }
}

export class ResultsScene extends Phaser.Scene {
  private data_!: ResultsData;
  private menu!: Menu;
  private backdrop!: Backdrop;
  private reward: { coins: number; lonchas: number; xp: number; xpStart: number; levelBefore: number; ready: boolean } | null = null;
  private lonchaText!: Phaser.GameObjects.BitmapText;
  private shownLonchas = 0;
  private recText!: Phaser.GameObjects.BitmapText;
  private startedAt = 0;
  private coinText!: Phaser.GameObjects.BitmapText;
  private shownCoins = 0;
  private xpBar!: Phaser.GameObjects.Graphics;
  private xpText!: Phaser.GameObjects.BitmapText;
  private xpAnim = 0;
  private fireworks!: Phaser.GameObjects.Particles.ParticleEmitter;
  private t = 0;
  private leveled = false;

  constructor() {
    super('Results');
  }

  init(data: ResultsData): void {
    this.data_ = data;
    this.reward = null;
    this.shownCoins = 0;
    this.xpAnim = 0;
    this.t = 0;
    this.leveled = false;
  }

  create(): void {
    fadeIn(this);
    this.backdrop = new Backdrop(this, false, 0.15);
    const d = this.data_;
    const mode = d.mode ?? 'pilla';
    const info = modeInfo(mode);
    const player = d.entries.find((e) => e.isPlayer)!;
    const won = mode === 'bomba' ? d.champion === player.name : d.winner === player.team;
    const winColor = mode === 'bomba' ? 0xfeae34 : TEAM_COLORS[d.winner].light;
    this.fireworks = this.add
      .particles(0, 0, 'p_confetti', {
        lifespan: 1400,
        speed: { min: 60, max: 180 },
        gravityY: 120,
        rotate: { min: 0, max: 360 },
        tint: [0xe43b44, 0xfee761, 0x63c74d, 0x2f88e8, 0xff7ab8, 0xffffff],
        emitting: false,
      })
      .setDepth(60);

    let bannerText = mode === 'pilla' ? (d.winner === 'chaser' ? '¡GANA EL EQUIPO AZUL!' : '¡GANA EL EQUIPO ROJO!') : `¡GANAN LOS ${d.winner === 'chaser' ? info.hunters : info.prey}!`;
    if (mode === 'bomba') bannerText = d.champion ? `¡${d.champion} GANA!` : '¡NADIE SOBREVIVE!';
    if (mode === 'infeccion' && d.winner === 'escapist' && d.champion) bannerText = `¡${d.champion}, LEYENDA!`;
    const banner = text(this, VIEW_W / 2, 14, bannerText, { scale: 2, color: winColor });
    banner.setScale(0);
    this.tweens.add({ targets: banner, scale: 2, duration: 350, ease: 'Back.easeOut' });
    text(this, VIEW_W / 2, 30, `${info.name} · ${won ? '¡VICTORIA!' : 'DERROTA... ¡A LA PRÓXIMA!'}`, { color: won ? UI.focusLight : UI.muted });

    // Lonchas, experiencia y récords: los decide el servidor.
    const medals = player.stats.medals ?? [];
    const xp0 = account.xpAtStart ?? account.profile?.xp ?? 0;
    this.reward = { coins: player.stats.coins ?? 0, lonchas: 0, xp: 0, xpStart: xp0, levelBefore: levelFor(xp0).level, ready: false };
    this.startedAt = performance.now();
    if (!d.online) {
      const s = player.stats;
      void account
        .reportOffline({ kind: 'match', mode, won, coins: s.coins, medals, stats: { passes: s.passes, survive: Math.floor(s.timeSurvived), infections: s.infections, finds: s.finds, rescues: s.rescues, hits: s.hits } })
        .then((r) => r && this.setReward(r));
    }
    if (won) this.confetti();

    // ---------------------------------------------------------- panel del jugador
    const g = this.add.graphics();
    panel(g, 8, 40, 172, 190);
    text(this, 94, 49, 'TU BOTÍN', { color: UI.focusLight });
    this.add.image(22, 64, 'item_coin');
    this.coinText = text(this, 32, 64, '0', { origin: [0, 0.5], color: 0xffd23f });
    this.add.image(100, 64, 'icon_loncha');
    this.lonchaText = text(this, 112, 64, '...', { origin: [0, 0.5], scale: 2, color: 0xff9aa2 });
    const best = account.profile?.records[mode]?.best ?? 0;
    if (this.reward.coins > best && this.reward.coins > 0) {
      const nb = text(this, 94, 76, '¡NUEVO RÉCORD!', { color: 0xff7ab8 });
      this.tweens.add({ targets: nb, scale: 1.3, yoyo: true, repeat: -1, duration: 300 });
    }
    // medallas
    text(this, 14, 82, `MEDALLAS (${medals.length})`, { origin: [0, 0.5], color: UI.text });
    medals.slice(0, 5).forEach((m, i) => {
      const y = 93 + i * 10;
      const star = this.add.image(18, y, 'p_star').setTint(0xffd23f).setScale(0);
      this.tweens.add({ targets: star, scale: 1, delay: 600 + i * 250, duration: 250, ease: 'Back.easeOut', onStart: () => audio.play('medal') });
      text(this, 26, y, m, { origin: [0, 0.5], color: 0xffd23f });
    });
    if (!medals.length) text(this, 94, 93, 'SIN MEDALLAS ESTA VEZ', { color: UI.muted });
    // carrera de caballos
    const hy = 148;
    const mine = d.myHorse === d.horse;
    this.add.sprite(22, hy, `horse_${d.horse}`, 'f0').play(`horse_${d.horse}_run`);
    text(this, 36, hy - 4, `CARRERA: ${HYPE.horses[d.horse] ?? '?'}`, { origin: [0, 0.5], color: mine ? 0xfee761 : UI.text });
    text(this, 36, hy + 6, mine ? `¡ACERTASTE! +${HYPE.coins.horse}` : `TU CABALLO: ${HYPE.horses[d.myHorse] ?? '?'}`, { origin: [0, 0.5], color: mine ? 0x63c74d : UI.muted });
    // nivel
    text(this, 14, 170, `NIVEL`, { origin: [0, 0.5], color: UI.text });
    this.xpText = text(this, 172, 170, '', { origin: [1, 0.5], color: 0x7cc8ff });
    this.xpBar = this.add.graphics();
    this.recText = text(this, 94, 196, account.offline ? 'SIN CONEXIÓN: NO SE GUARDAN LONCHAS' : 'CALCULANDO LONCHAS...', { color: UI.muted });

    // ---------------------------------------------------------- ranking de la partida
    panel(g, 186, 40, 286, 190);
    text(this, 329, 49, 'RANKING DE LA PARTIDA', { color: MODE_COLORS[mode] ?? UI.focusLight });
    const list = [...d.entries].sort((a, b) => (b.stats.coins ?? 0) - (a.stats.coins ?? 0));
    const twoCols = list.length > 12;
    const perCol = twoCols ? Math.ceil(list.length / 2) : list.length;
    const rowH = twoCols ? 13 : Math.min(13, Math.floor(160 / list.length));
    list.forEach((e, i) => {
      const colIdx = Math.floor(i / perCol);
      const x0 = twoCols ? 192 + colIdx * 140 : 194;
      const x1 = twoCols ? x0 + 134 : 466;
      const y = 62 + (i % perCol) * rowH;
      const col = mode === 'bomba' ? 0xfeae34 : mode === 'infeccion' && e.team === 'chaser' ? 0x63c74d : TEAM_COLORS[e.team].light;
      g.fillStyle(col, 1).fillRect(x0, y - 2, 4, 4);
      const pos = `${i + 1}.`;
      const medal = (e.stats.medals?.length ?? 0) > 0 ? '★' : '';
      const name = `${pos} ${medal}${e.name}`;
      const row = this.add.bitmapText(x0 + 7, y, FONT, fontText(twoCols ? name.slice(0, 12) : name)).setOrigin(0, 0.5).setTint(e.isPlayer ? 0xfee761 : i === 0 ? 0xffd23f : UI.text);
      const coins = `${e.stats.coins ?? 0}`;
      const stat = twoCols ? `${coins}` : `${statLine(mode, e, false)} · ${coins}`;
      const st = this.add.bitmapText(x1, y, FONT, fontText(stat)).setOrigin(1, 0.5).setTint(e.alive || e.team === 'chaser' ? UI.text : UI.muted);
      // entran de uno en uno
      for (const o of [row, st]) {
        o.setAlpha(0);
        this.tweens.add({ targets: o, alpha: 1, delay: 200 + i * 60, duration: 150 });
      }
    });
    if (twoCols) text(this, 329, 222, 'ORDENADOS POR MONEDAS', { color: UI.muted });

    this.menu = new Menu(true);
    if (d.online) {
      this.menu.add(new Button(this, VIEW_W / 2 - 64, VIEW_H - 18, 'VOLVER A LA SALA', () => fadeTo(this, 'Lobby'), 120, 18, UI.green));
      this.menu.add(
        new Button(
          this,
          VIEW_W / 2 + 64,
          VIEW_H - 18,
          'SALIR',
          () => {
            net.leave();
            fadeTo(this, 'Menu');
          },
          100,
          18,
        ),
      );
    } else {
      this.menu.add(new Button(this, VIEW_W / 2 - 110, VIEW_H - 18, 'REVANCHA', () => fadeTo(this, 'RoleReveal', { mode, mapId: d.mapId, horse: d.myHorse }), 100, 18, UI.green));
      this.menu.add(new Button(this, VIEW_W / 2, VIEW_H - 18, 'OTRO MODO', () => fadeTo(this, 'ModeSelect'), 100, 18));
      this.menu.add(new Button(this, VIEW_W / 2 + 110, VIEW_H - 18, 'MENÚ', () => fadeTo(this, 'Menu'), 100, 18));
    }
    this.time.delayedCall(1200, () => audio.playMusic('menu'));
  }

  /** Llega lo ganado (del servidor). */
  private setReward(res: ApplyResult): void {
    const r = this.reward;
    if (!r || r.ready) return;
    r.lonchas = res.lonchas;
    r.xp = res.xp;
    r.ready = true;
    const rec = account.profile?.records[this.data_.mode ?? 'pilla'];
    this.recText.setText(fontText(`+${res.xp} EXP${rec ? ` · ${rec.wins}/${rec.games} VICTORIAS · RÉCORD ${rec.best}` : ''}`));
  }

  private confetti(): void {
    this.add
      .particles(0, -8, 'p_confetti', {
        x: { min: 0, max: VIEW_W },
        lifespan: 3500,
        speedY: { min: 30, max: 70 },
        speedX: { min: -20, max: 20 },
        rotate: { min: 0, max: 360 },
        tint: [0xfee761, 0xe43b44, 0x7cc8ff, 0x63c74d, 0xffffff, 0xff7ab8],
        frequency: 30,
        duration: 3500,
      })
      .setDepth(50);
  }

  update(_t: number, delta: number): void {
    const dt = delta / 1000;
    this.t += dt;
    this.backdrop.update(dt);
    const r = this.reward;
    // Online, la recompensa llega por la red (puede llegar antes o después de esta pantalla).
    if (r && !r.ready && this.data_.online && account.lastReward && account.lastReward.at > this.startedAt - 30000) this.setReward(account.lastReward.res);
    if (r) {
      // monedas que suben rodando
      if (this.shownCoins < r.coins) {
        this.shownCoins = Math.min(r.coins, this.shownCoins + Math.max(1, Math.ceil(r.coins * dt * 0.8)));
        this.coinText.setText(String(this.shownCoins));
        if (Math.floor(this.t * 20) % 2 === 0) audio.play('coin');
      }
      if (r.ready && this.shownLonchas < r.lonchas) {
        this.shownLonchas = Math.min(r.lonchas, this.shownLonchas + Math.max(1, Math.ceil(r.lonchas * dt * 1.2)));
        this.lonchaText.setText(`+${this.shownLonchas}`);
        if (Math.floor(this.t * 20) % 2 === 0) audio.play('coin');
      } else if (r.ready && r.lonchas === 0) this.lonchaText.setText('+0');
      // barra de experiencia que se llena (con subida de nivel)
      if (r.ready) this.xpAnim = Math.min(1, this.xpAnim + dt * 0.6);
      const xp = r.xpStart + r.xp * this.xpAnim;
      const L = levelFor(xp);
      this.xpText.setText(fontText(`NV ${L.level} · ${Math.floor(L.cur)}/${L.next}`));
      const g = this.xpBar;
      g.clear();
      g.fillStyle(0x0d0b14, 1).fillRect(13, 177, 160, 7);
      g.fillStyle(0x1d2a44, 1).fillRect(14, 178, 158, 5);
      g.fillStyle(0x7cc8ff, 1).fillRect(14, 178, Math.round(158 * (L.cur / L.next)), 5);
      g.fillStyle(0xffffff, 0.35).fillRect(14, 178, Math.round(158 * (L.cur / L.next)), 1);
      if (!this.leveled && L.level > r.levelBefore) {
        this.leveled = true;
        audio.play('levelup');
        const t = text(this, 94, 160, `¡SUBES A NIVEL ${L.level}!`, { scale: 2, color: 0x7cc8ff }).setDepth(70);
        t.setScale(0);
        this.tweens.add({ targets: t, scale: 2, duration: 300, ease: 'Back.easeOut' });
        this.tweens.add({ targets: t, alpha: 0, delay: 2200, duration: 400 });
        for (let k = 0; k < 5; k++) this.time.delayedCall(k * 250, () => this.fireworks.emitParticleAt(40 + Math.random() * 400, 40 + Math.random() * 120, 40));
      }
    }
    if (input.back()) {
      audio.play('back');
      fadeTo(this, this.data_.online ? 'Lobby' : 'Menu');
      return;
    }
    this.menu.update();
  }
}
