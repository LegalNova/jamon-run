import Phaser from 'phaser';
import { VIEW_H, VIEW_W } from '../config/balance';
import { NET, PARON, ParonLevel } from '../../shared/balance';

const PARON_LEVELS = Object.keys(PARON.levels) as ParonLevel[];
const PARON_NAMES: Record<ParonLevel, string> = { no: 'NINGUNO', pocos: 'POCOS', normal: 'NORMAL', muchos: 'MUCHOS' };
import { LOOK_COLORS } from '../../shared/look';
import { mapAllowed, MAPS } from '../../shared/maps';
import { MODE_LIST, modeInfo } from '../../shared/modes/rules';
import type { ModeId } from '../../shared/sim/types';
import type { ServerMsg } from '../../shared/protocol';
import { audio } from '../core/audio';
import { input } from '../core/input';
import { ensureCharTexture } from '../gfx/characters';
import { fontText } from '../gfx/font';
import { hexToInt } from '../gfx/palette';
import { net } from '../net/NetClient';
import { OnlineModel } from '../net/OnlineModel';
import { Button, Menu, OptionRow, panel, text, UI } from '../ui/widgets';
import { addFullscreenButton, Backdrop, fadeIn, fadeTo } from './common';

const DIFFS = ['easy', 'normal', 'hard'] as const;
const MODE_IDS = MODE_LIST.map((m) => m.id);
const SHORT: Record<ModeId, string> = { pilla: 'PILLA', infeccion: 'INFECCIÓN', bomba: 'BOMBA', escondite: 'ESCONDITE' };
const DIFF_NAMES = { easy: 'FÁCIL', normal: 'NORMAL', hard: 'DIFÍCIL' };

function fmt(s: number): string {
  return `${Math.floor(s / 60)}:${(s % 60).toString().padStart(2, '0')}`;
}

/** Sala de espera online: jugadores, listo, ajustes del anfitrión y enlace para invitar. */
export class LobbyScene extends Phaser.Scene {
  private menu!: Menu;
  private backdrop!: Backdrop;
  private list!: Phaser.GameObjects.Container;
  private codeText!: Phaser.GameObjects.BitmapText;
  private status!: Phaser.GameObjects.BitmapText;
  private countText!: Phaser.GameObjects.BitmapText;
  private rows: OptionRow[] = [];
  private hostRows: OptionRow[] = [];
  private votesText!: Phaser.GameObjects.BitmapText;
  private readyBtn!: Button;
  private startBtn!: Button;
  private unsub: (() => void) | null = null;
  private flash = '';
  private flashT = 0;
  private leaving = false;
  private lastLobbyKey = '';

  constructor() {
    super('Lobby');
  }

  create(): void {
    fadeIn(this);
    this.leaving = false;
    this.lastLobbyKey = '';
    this.backdrop = new Backdrop(this, false, 0.15);
    addFullscreenButton(this);
    const g = this.add.graphics();
    panel(g, 6, 34, 300, 214);
    panel(g, 312, 34, 162, 214);

    text(this, 10, 16, 'SALA', { origin: [0, 0.5], color: UI.muted });
    this.codeText = text(this, 40, 16, net.code || '-----', { origin: [0, 0.5], scale: 2, color: UI.focusLight });
    this.countText = text(this, 302, 16, '', { origin: [1, 0.5], color: UI.text });
    this.votesText = text(this, 312, 16, '', { origin: [0, 0.5], color: 0xfee761 });
    this.list = this.add.container(0, 0);

    this.menu = new Menu();
    const host = () => !!net.lobby && net.lobby.players.some((p) => p.id === net.you && p.host);
    const set = (s: object) => {
      if (!host()) {
        audio.play('denied');
        this.say('SOLO EL ANFITRIÓN CAMBIA LOS AJUSTES');
        return;
      }
      net.sendMsg({ t: 'settings', s });
    };
    const cur = () => net.lobby?.settings;
    const cycle = <T,>(arr: readonly T[], v: T | undefined, d: number) => arr[(arr.indexOf(v as T) + d + arr.length) % arr.length];
    const x = 393;
    const W = 156;
    const me = () => net.lobby?.players.find((p) => p.id === net.you);
    const modes: (ModeId | 'voto')[] = ['voto', ...MODE_IDS];
    const defs: [string, () => string, (d: number) => void, boolean][] = [
      ['MODO', () => (cur()?.mode === 'voto' || !cur() ? 'VOTACIÓN' : SHORT[cur()!.mode as ModeId]), (d) => set({ mode: cycle(modes, cur()?.mode, d) }), true],
      ['TU VOTO', () => (me()?.vote ? SHORT[me()!.vote!] : '-'), (d) => net.sendMsg({ t: 'vote', m: cycle(MODE_IDS, me()?.vote ?? undefined, d) }), false],
      ['PARONES', () => PARON_NAMES[(cur()?.paron ?? 'normal') as ParonLevel], (d) => set({ paron: cycle(PARON_LEVELS, (cur()?.paron ?? 'normal') as ParonLevel, d) }), true],
      ['MAPA', () => MAPS.find((m) => m.id === cur()?.mapId)?.name ?? '', (d) => set({ mapId: cycle(MAPS.filter((m) => cur()?.mode === 'voto' || mapAllowed(m, cur()?.mode ?? 'pilla')).map((m) => m.id), cur()?.mapId, d) }), true],
      ['CAZADORES', () => (cur()?.hunters ? String(cur()!.hunters) : 'AUTO'), (d) => set({ hunters: cycle(NET.huntersOptions, cur()?.hunters as never, d) }), true],
      ['DURACIÓN', () => fmt(cur()?.duration ?? 120), (d) => set({ duration: cycle(NET.durationOptions, cur()?.duration as never, d) }), true],
      ['BOTS', () => (cur()?.botFill ? `HASTA ${cur()!.botFill}` : 'NO'), (d) => set({ botFill: cycle(NET.botFillOptions, cur()?.botFill as never, d) }), true],
      ['DIFICULTAD', () => DIFF_NAMES[cur()?.difficulty ?? 'normal'], (d) => set({ difficulty: cycle(DIFFS, cur()?.difficulty, d) }), true],
      ['PÚBLICA', () => (cur()?.isPublic ? 'SÍ' : 'NO'), () => set({ isPublic: !cur()?.isPublic }), true],
    ];
    this.hostRows = [];
    this.rows = defs.map(([label, get, change, hostOnly], i) => {
      const r = this.menu.add(new OptionRow(this, x, 43 + i * 16, label, get, change, W, undefined, 66));
      if (hostOnly) this.hostRows.push(r);
      return r;
    });
    this.readyBtn = this.menu.add(new Button(this, x, 189, '¡ESTOY LISTO!', () => this.toggleReady(), 150, 14, UI.green));
    this.startBtn = this.menu.add(new Button(this, x, 205, 'EMPEZAR PARTIDA', () => net.sendMsg({ t: 'start' }), 150, 14, UI.green));
    this.menu.add(new Button(this, x - 38, 221, 'COPIAR ENLACE', () => this.copyLink(), 74, 14));
    // Mientras se espera, un minijuego contra bots (si empieza la partida, te lleva a ella).
    this.menu.add(new Button(this, x + 38, 221, 'MINIJUEGO', () => fadeTo(this, 'MinigameHub', { fromLobby: true }), 74, 14, UI.green));
    this.menu.add(new Button(this, x - 38, 238, 'PERSONAJE', () => this.editLook(), 74, 14));
    this.menu.add(new Button(this, x + 38, 238, 'SALIR', () => this.leave(), 74, 14));
    this.status = text(this, VIEW_W / 2, VIEW_H - 10, '', { color: UI.focus });

    this.unsub = net.on((m) => this.onMsg(m));
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.unsub?.());
    this.refresh();
    // ¿Empezó una partida mientras estábamos en otra pantalla?
    const pending = net.takePendingStart();
    if (pending) this.time.delayedCall(50, () => this.goToMatch(pending));
  }

  private onMsg(m: ServerMsg): void {
    if (m.t === 'lobby' || m.t === 'welcome') this.refresh();
    else if (m.t === 'start') {
      net.takePendingStart();
      this.goToMatch(m);
    } else if (m.t === 'error') this.say(m.msg);
  }

  private goToMatch(m: Extract<ServerMsg, { t: 'start' }>): void {
    if (this.leaving) return;
    this.leaving = true;
    const model = new OnlineModel(m);
    fadeTo(this, 'RoleReveal', { online: model, revealMs: m.revealMs });
  }

  private say(s: string): void {
    this.flash = s;
    this.flashT = 3;
  }

  private toggleReady(): void {
    const me = net.lobby?.players.find((p) => p.id === net.you);
    net.sendMsg({ t: 'ready', v: !me?.ready });
  }

  private copyLink(): void {
    const url = `${location.origin}${location.pathname}?sala=${net.code}`;
    const done = () => this.say('¡ENLACE COPIADO! PÁSASELO A TUS AMIGOS');
    try {
      void navigator.clipboard.writeText(url).then(done, () => this.say(url));
    } catch {
      this.say(url);
    }
  }

  private editLook(): void {
    net.sendMsg({ t: 'ready', v: false });
    fadeTo(this, 'Character', { back: 'Lobby' });
  }

  private leave(): void {
    this.leaving = true;
    net.leave();
    fadeTo(this, 'Online');
  }

  /** Vuelve a pintar la lista de jugadores y el estado de los botones. */
  private refresh(): void {
    const lobby = net.lobby;
    this.codeText.setText(fontText(net.code || '-----'));
    for (const r of this.rows) r.refresh();
    if (!lobby) return;
    const me = lobby.players.find((p) => p.id === lobby.you);
    const isHost = !!me?.host;
    this.countText.setText(fontText(`${lobby.players.filter((p) => p.connected).length}/${NET.maxPlayers} JUGADORES`));
    this.hostRows.forEach((r) => (r.enabled = isHost));
    // Recuento de votos de modo.
    const votes = new Map<ModeId, number>();
    for (const p of lobby.players) if (p.connected && p.vote) votes.set(p.vote, (votes.get(p.vote) ?? 0) + 1);
    const mode = lobby.settings.mode;
    this.votesText.setText(
      fontText(mode === 'voto' ? `VOTOS: ${MODE_IDS.map((m) => `${SHORT[m][0]}${votes.get(m) ?? 0}`).join(' ')}` : `MODO: ${modeInfo(mode).name}`),
    );
    this.readyBtn.setText(me?.ready ? 'YA NO ESTOY LISTO' : '¡ESTOY LISTO!');
    const others = lobby.players.filter((p) => p.connected && p.id !== lobby.you);
    const allReady = others.every((p) => p.ready);
    this.startBtn.setText(isHost ? 'EMPEZAR PARTIDA' : 'ESPERA AL ANFITRIÓN');
    this.startBtn.setEnabled(isHost && allReady && lobby.phase === 'lobby');

    // lista (solo se rehace si cambia algo)
    const key = JSON.stringify(lobby.players);
    if (key === this.lastLobbyKey) return;
    this.lastLobbyKey = key;
    this.list.removeAll(true);
    lobby.players.forEach((p, i) => {
      const col = i < 10 ? 0 : 1;
      const row = i % 10;
      const x = 12 + col * 148;
      const y = 40 + row * 20.5;
      const tex = ensureCharTexture(this, null, p.look);
      const spr = this.add.sprite(x + 9, y + 20, tex, 'down_idle0').setOrigin(0.5, 1);
      spr.play(`${tex}_down_idle`);
      if (!p.connected) spr.setAlpha(0.4);
      const name = text(this, x + 21, y + 11, `${p.host ? '★ ' : ''}${p.name}${p.id === lobby.you ? ' (TÚ)' : ''}`, {
        origin: [0, 0.5],
        color: p.connected ? hexToInt(LOOK_COLORS[p.look.color]?.hex ?? '#ffffff') : UI.muted,
      });
      const state = text(this, x + 142, y + 11, !p.connected ? 'RECONECTANDO' : p.ready || p.host ? 'LISTO' : '...', {
        origin: [1, 0.5],
        color: !p.connected ? UI.muted : p.ready || p.host ? UI.green : UI.muted,
      });
      this.list.add([spr, name, state]);
    });
  }

  update(_t: number, delta: number): void {
    const dt = delta / 1000;
    this.backdrop.update(dt);
    this.flashT -= dt;
    const lobby = net.lobby;
    let s = '';
    if (this.flashT > 0) s = this.flash;
    else if (net.status === 'connecting') s = 'CONECTANDO...';
    else if (net.status === 'reconnecting') s = 'SE CORTÓ LA CONEXIÓN. RECONECTANDO...';
    else if (net.status === 'full') s = 'LA SALA ESTÁ LLENA (20 JUGADORES)';
    else if (net.status === 'closed') s = 'DESCONECTADO. SAL Y VUELVE A ENTRAR';
    else if (lobby && lobby.phase !== 'lobby') s = 'HAY UNA PARTIDA EN CURSO: ENTRARÁS EN LA SIGUIENTE';
    else if (lobby) {
      const bots = Math.max(0, lobby.settings.botFill - lobby.players.filter((p) => p.connected).length);
      s = `PING ${Math.round(net.ping)} MS · ${bots ? `SE AÑADIRÁN ${bots} BOTS` : 'SIN BOTS'} · F PANTALLA COMPLETA`;
    }
    this.status.setText(fontText(s));
    if (input.back()) {
      audio.play('back');
      this.leave();
      return;
    }
    this.menu.update();
  }
}
