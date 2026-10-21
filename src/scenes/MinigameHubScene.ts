import Phaser from 'phaser';
import { VIEW_H, VIEW_W } from '../config/balance';
import { profile } from '../config/profile';
import { audio } from '../core/audio';
import { input } from '../core/input';
import { botName, randomLook } from '../../shared/look';
import { MgId, MINIGAMES, Paron } from '../../shared/minigames';
import type { Equipped } from '../../shared/economy';
import type { ServerMsg } from '../../shared/protocol';
import type { Team } from '../../shared/sim/types';
import { reportMinigame } from '../game/model';
import { FONT, fontText } from '../gfx/font';
import { account } from '../net/account';
import { net } from '../net/NetClient';
import { OnlineModel } from '../net/OnlineModel';
import { Button, Focusable, Menu, panel, text, UI } from '../ui/widgets';
import { botCos } from './GameScene';
import { Backdrop, fadeIn, fadeTo } from './common';
import type { MgHost } from './MinigameScene';

class MgCard extends Phaser.GameObjects.Container implements Focusable {
  private g: Phaser.GameObjects.Graphics;
  private icon: Phaser.GameObjects.Image;
  private focused = false;
  enabled = true;
  menu?: Menu;
  private t = Math.random() * 5;

  constructor(scene: Phaser.Scene, x: number, y: number, private color: number, iconKey: string, name: string, sub: string, private onPick: () => void) {
    super(scene, x, y);
    this.g = scene.add.graphics();
    this.icon = scene.add.image(0, -14, iconKey).setScale(1.4);
    const words = name.split(' ');
    const l1 = words.slice(0, Math.ceil(words.length / 2)).join(' ');
    const l2 = words.slice(Math.ceil(words.length / 2)).join(' ');
    this.add([this.g, this.icon, scene.add.bitmapText(0, 14, FONT, fontText(l1)).setOrigin(0.5).setTint(color), scene.add.bitmapText(0, 23, FONT, fontText(l2)).setOrigin(0.5).setTint(color), scene.add.bitmapText(0, 34, FONT, fontText(sub)).setOrigin(0.5).setTint(UI.muted)]);
    this.setSize(104, 84);
    this.setInteractive({ useHandCursor: true });
    this.on('pointerover', () => this.menu?.focusItem(this));
    this.on('pointerup', () => this.activate());
    this.redraw();
    scene.add.existing(this);
  }

  private redraw(): void {
    const g = this.g;
    g.clear();
    g.fillStyle(0x000000, 0.4).fillRect(-50, -40, 104, 84);
    g.fillStyle(this.focused ? this.color : 0x0d0b14, 1).fillRect(-52, -42, 104, 84);
    g.fillStyle(this.focused ? UI.panelLight : UI.panel, 1).fillRect(-50, -40, 100, 80);
    g.fillStyle(this.color, 0.2).fillRect(-50, -40, 100, 34);
  }

  setFocused(f: boolean, silent = false): void {
    if (f && !this.focused && !silent) audio.play('hover');
    this.focused = f;
    this.redraw();
  }

  activate(): void {
    audio.play('click');
    this.scene.tweens.add({ targets: this, scale: 1.08, yoyo: true, duration: 90 });
    this.onPick();
  }

  tick(dt: number): void {
    this.t += dt;
    this.icon.setAngle(this.focused ? Math.sin(this.t * 8) * 8 : 0).setScale(this.focused ? 1.6 : 1.4);
  }
}

/** Sala de minijuegos: los 8 minijuegos del Parón, sueltos, contra bots. */
export class MinigameHubScene extends Phaser.Scene {
  private menu!: Menu;
  private cards: MgCard[] = [];
  private backdrop!: Backdrop;
  private pr: Paron | null = null;
  private players: { id: number; name: string; team: Team; bot: boolean; look: ReturnType<typeof randomLook>; cos: Equipped }[] = [];
  private reactions: { id: number; e: number }[] = [];
  private fromLobby = false;
  private extra = { rouletteHistory: [] as string[] };
  private unsub: (() => void) | null = null;

  constructor() {
    super('MinigameHub');
  }

  init(data: { fromLobby?: boolean }): void {
    this.fromLobby = !!data.fromLobby;
    this.pr = null;
  }

  create(): void {
    fadeIn(this);
    this.backdrop = new Backdrop(this, false, 0.25);
    text(this, VIEW_W / 2, 12, 'SALA DE MINIJUEGOS', { scale: 2, color: UI.focusLight });
    text(this, VIEW_W / 2, 28, this.fromLobby ? 'MIENTRAS EMPIEZA LA PARTIDA · CONTRA BOTS' : 'LOS MINIJUEGOS DEL PARÓN, SUELTOS · CONTRA BOTS', { color: UI.muted });
    this.menu = new Menu(true);
    this.cards = MINIGAMES.map((d, i) => {
      const rec = account.profile?.mgRecords[d.id];
      const card = new MgCard(this, VIEW_W / 2 + ((i % 4) - 1.5) * 112, 82 + Math.floor(i / 4) * 92, d.color, `mg_${d.id}`, d.name, rec ? `${rec.wins}/${rec.played} GANADOS` : '¡NUEVO!', () => this.play(d.id));
      this.menu.add(card);
      return card;
    });
    this.menu.add(new Button(this, VIEW_W / 2 - 60, VIEW_H - 18, '¡AL AZAR!', () => this.play(MINIGAMES[Math.floor(Math.random() * MINIGAMES.length)].id), 100, 16, UI.green));
    this.menu.add(new Button(this, VIEW_W / 2 + 60, VIEW_H - 18, 'VOLVER', () => this.back(), 100, 16));
    const g = this.add.graphics();
    panel(g, 6, VIEW_H - 40, 120, 14, UI.panelDark);
    const streak = account.profile?.mgStreak ?? 0;
    text(this, 66, VIEW_H - 33, streak >= 2 ? `RACHA ${streak} · X${[1, 1, 1.2, 1.5, 2][Math.min(4, streak)]}` : 'GANA SEGUIDOS: X1.2 X1.5 X2', { color: streak >= 2 ? 0xfeae34 : UI.muted });
    // Desde la sala online: si empieza la partida, vamos a ella.
    this.unsub = net.on((m: ServerMsg) => {
      if (m.t === 'start' && this.fromLobby) {
        net.takePendingStart();
        this.scene.stop('Minigame');
        fadeTo(this, 'RoleReveal', { online: new OnlineModel(m), revealMs: m.revealMs });
      }
    });
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.unsub?.());
  }

  private back(): void {
    fadeTo(this, this.fromLobby ? 'Lobby' : 'Menu');
  }

  private play(id: MgId): void {
    if (this.pr) return;
    const me = { id: 0, name: profile.look.name, team: 'escapist' as Team, bot: false, look: profile.look, cos: account.profile?.equipped ?? {} };
    this.players = [me];
    let bi = Math.floor(Math.random() * 20);
    for (let i = 1; i < 8; i++) {
      const name = botName(bi++);
      this.players.push({ id: i, name, team: i % 2 ? 'chaser' : 'escapist', bot: true, look: randomLook(name), cos: botCos() });
    }
    this.pr = new Paron(
      this.players.map((p) => ({ id: p.id, name: p.name, team: p.team, bot: p.bot })),
      Math.random,
      { solo: true, forced: id, extra: this.extra, skipBreak: true },
    );
    const host: MgHost = {
      myId: 0,
      net: () => (this.pr ? this.pr.net() : null),
      t: () => (this.pr ? this.pr.game.t : 0),
      input: (k) => this.pr?.input(0, k, 0),
      react: (e) => this.reactions.push({ id: 0, e }),
      reactions: () => {
        const r = this.reactions;
        this.reactions = [];
        return r;
      },
      info: (pid) => this.players.find((p) => p.id === pid),
      onEnd: () => undefined,
    };
    audio.playMusic(null);
    this.scene.launch('Minigame', { host });
    this.scene.bringToTop('Minigame');
    this.scene.bringToTop('Toast');
  }

  update(_t: number, delta: number): void {
    const dt = delta / 1000;
    this.backdrop.update(dt);
    if (this.pr) {
      this.pr.tick(dt);
      if (Math.random() < dt * 1.2) this.reactions.push({ id: 1 + Math.floor(Math.random() * 7), e: Math.floor(Math.random() * 5) });
      if (this.pr.done) {
        reportMinigame(this.pr, 0);
        this.pr = null;
        audio.playMusic('menu');
        this.scene.restart({ fromLobby: this.fromLobby });
      }
      return;
    }
    for (const c of this.cards) c.tick(dt);
    if (input.back()) {
      audio.play('back');
      this.back();
      return;
    }
    if (input.nav('down') && this.menu.index < 4) this.menu.setIndex(this.menu.index + 4);
    else if (input.nav('up') && this.menu.index >= 4) this.menu.setIndex(this.menu.index >= 8 ? 4 : this.menu.index - 4);
    this.menu.update();
  }
}
