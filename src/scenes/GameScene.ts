import Phaser from 'phaser';
import { BALANCE } from '../config/balance';
import { settings } from '../config/settings';
import { profile } from '../config/profile';
import { audio } from '../core/audio';
import { input } from '../core/input';
import { voice } from '../core/voice';
import { botName, Look, randomLook } from '../../shared/look';
import { scaleFor } from '../../shared/mapScale';
import type { SimChar } from '../../shared/sim/Char';
import type { RosterEntry, SimEvent, Stats, Team } from '../../shared/sim/types';
import { CharacterView } from '../game/CharacterView';
import { GameModel, OfflineModel } from '../game/model';
import { PICKUP_COLORS, PICKUP_NAMES, PickupView, ProjectileView } from '../game/views';
import { Fx } from '../gfx/fx';
import { TEAM_COLORS } from '../gfx/palette';
import { GameMap } from '../world/GameMap';
import { BiomeId } from '../world/maps';
import { viewSize } from './common';

export interface GameData {
  mapId?: BiomeId;
  role?: Team;
  /** Partida online ya preparada (si no, se crea una partida offline con bots). */
  model?: GameModel;
}

export interface ResultEntry {
  name: string;
  team: Team;
  isPlayer: boolean;
  alive: boolean;
  stats: Stats;
  look: Look;
}

export interface ResultsData {
  mapId: BiomeId;
  role: Team;
  winner: Team;
  timePlayed: number;
  duration: number;
  entries: ResultEntry[];
  online: boolean;
}

export class GameScene extends Phaser.Scene {
  model!: GameModel;
  map!: GameMap;
  fx!: Fx;
  data_!: GameData;
  private views = new Map<number, CharacterView>();
  private pickupViews = new Map<number, PickupView>();
  private projViews = new Map<number, ProjectileView>();
  private hitStopTimer = 0;
  private lastBush: Phaser.GameObjects.Image | null = null;
  private camTarget = new Phaser.Math.Vector2();
  private spectate: SimChar | null = null;
  private lastWarnSecond = -1;
  private endTimer = 0;
  private autotest = false;
  private simSpeed = 1;
  private finished = false;
  private smokePuff = 0;
  private ambient!: Phaser.GameObjects.Particles.ParticleEmitter;

  constructor() {
    super('Game');
  }

  get player(): SimChar {
    return this.model.player();
  }

  init(data: GameData): void {
    this.data_ = data;
    this.views = new Map();
    this.pickupViews = new Map();
    this.projViews = new Map();
    this.hitStopTimer = 0;
    this.lastBush = null;
    this.spectate = null;
    this.lastWarnSecond = -1;
    this.endTimer = 0;
    this.finished = false;
    const params = new URLSearchParams(window.location.search);
    this.autotest = params.has('autotest') && !data.model;
    this.simSpeed = this.autotest ? Math.max(1, Math.min(8, Number(params.get('speed') ?? 4))) : 1;
  }

  create(): void {
    this.cameras.main.fadeIn(250, 13, 11, 20);
    this.model = this.data_.model ?? this.createOffline();

    this.map = new GameMap(this, this.model.mapId, this.model.grid);
    this.fx = new Fx(this, this.model.mapId);
    this.createAmbient();

    const cam = this.cameras.main;
    cam.setRoundPixels(true);
    const p = this.player;
    this.camTarget.set(p.x, p.y);
    cam.startFollow(this.camTarget, true, 0.14, 0.14);
    this.applyView();
    cam.centerOn(p.x, p.y);
    this.scale.on(Phaser.Scale.Events.RESIZE, this.onResize, this);

    audio.playMusic('game');
    this.scene.launch('UI');
    this.scene.bringToTop('UI');
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.cleanup());
    if (!this.model.online) this.time.delayedCall(10, () => this.events.emit('countdown', BALANCE.match.countdown));
  }

  private createOffline(): GameModel {
    const role: Team = this.data_.role ?? 'escapist';
    const mapId: BiomeId = this.data_.mapId ?? 'forest';
    const nCh = settings.chasers;
    const nEs = settings.escapists;
    const playerIndex = Math.floor(Math.random() * (role === 'chaser' ? nCh : nEs));
    const roster: RosterEntry[] = [];
    let id = 0;
    let botI = Math.floor(Math.random() * 20);
    for (let i = 0; i < nCh; i++) {
      const me = role === 'chaser' && i === playerIndex;
      const name = botName(botI++);
      roster.push({ id: id++, team: 'chaser', name: me ? profile.look.name : name, look: me ? profile.look : randomLook(name), human: me && !this.autotest });
    }
    for (let i = 0; i < nEs; i++) {
      const me = role === 'escapist' && i === playerIndex;
      const name = botName(botI++);
      roster.push({ id: id++, team: 'escapist', name: me ? profile.look.name : name, look: me ? profile.look : randomLook(name), human: me && !this.autotest });
    }
    const playerId = roster.find((r) => r.team === role && (r.human || this.autotest))!.id;
    const pid = this.autotest ? roster.filter((r) => r.team === role)[playerIndex].id : playerId;
    return new OfflineModel(
      { mapId, scale: scaleFor(roster.length), duration: settings.duration, difficulty: settings.difficulty, roster },
      pid,
    );
  }

  /** Zoom entero según la ventana; si el mapa es más pequeño que la vista, queda centrado. */
  private applyView(): void {
    const { Z, W, H } = viewSize(this);
    const cam = this.cameras.main;
    cam.setZoom(Z);
    const mw = this.map.widthPx;
    const mh = this.map.heightPx;
    const bw = Math.max(mw, W);
    const bh = Math.max(mh, H);
    cam.setBounds((mw - bw) / 2, (mh - bh) / 2, bw, bh);
  }

  private onResize(): void {
    this.applyView();
  }

  private createAmbient(): void {
    const id = this.model.mapId;
    const cfg: Phaser.Types.GameObjects.Particles.ParticleEmitterConfig =
      id === 'snow'
        ? { x: { min: -20, max: 1000 }, y: -6, lifespan: 6000, speedY: { min: 14, max: 30 }, speedX: { min: -10, max: 6 }, scale: { min: 1, max: 2 }, alpha: { min: 0.6, max: 1 }, frequency: 50, tint: 0xffffff }
        : id === 'desert'
          ? { x: -10, y: { min: 0, max: 600 }, lifespan: 4500, speedX: { min: 50, max: 90 }, speedY: { min: -6, max: 6 }, scale: { min: 1, max: 2 }, alpha: { start: 0.55, end: 0 }, frequency: 90, tint: 0xfff1c4 }
          : { x: { min: 0, max: 1000 }, y: -6, lifespan: 7000, speedY: { min: 10, max: 22 }, speedX: { min: -16, max: 16 }, rotate: { min: 0, max: 360 }, scale: 1, alpha: { min: 0.7, max: 1 }, frequency: 350, tint: [0x63c74d, 0xfeae34, 0x3e8948] };
    // Sigue a la vista de la cámara (en coordenadas del mundo).
    this.ambient = this.add.particles(0, 0, id === 'forest' ? 'p_leaf' : 'p_dot', cfg).setDepth(9800);
  }

  private cleanup(): void {
    this.scale.off(Phaser.Scale.Events.RESIZE, this.onResize, this);
    for (const v of this.views.values()) v.destroy();
    for (const v of this.pickupViews.values()) v.destroy();
    for (const v of this.projViews.values()) v.destroy();
    this.views.clear();
    this.pickupViews.clear();
    this.projViews.clear();
    voice.stop();
    if (!this.finished) this.model.destroy();
  }

  cycleSpectate(): void {
    const alive = this.model.chars.filter((c) => c.alive && !c.isChaser);
    if (!alive.length) return;
    const i = this.spectate ? alive.indexOf(this.spectate) : -1;
    this.spectate = alive[(i + 1) % alive.length];
    audio.play('hover');
    this.events.emit('feed', `CÁMARA: ${this.spectate.name}`, 0x7cc8ff);
  }

  // ------------------------------------------------------------------ bucle

  update(_time: number, delta: number): void {
    const realDt = Math.min(delta / 1000, 1 / 20);
    const m = this.model;

    const menuOpen = this.scene.isActive('Pause') || this.scene.isActive('Options');
    if (!this.autotest && m.state !== 'ended' && !menuOpen) {
      if (input.justPressed('pause')) {
        this.openPause();
        return;
      }
      this.readInput();
    } else if (menuOpen) {
      m.setHeld({ mx: 0, my: 0, sprint: false });
    }

    for (let s = 0; s < this.simSpeed; s++) this.step(realDt);
  }

  private readInput(): void {
    const v = input.moveVector();
    const p = this.player;
    this.model.setHeld({ mx: v.x, my: v.y, sprint: input.isDown('sprint') });
    // Con la rueda de frases abierta, ESPACIO/E sirven para elegir frase.
    if ((this.scene.get('UI') as { wheelOpen?: boolean } | null)?.wheelOpen) return;
    if (input.justPressed('action')) {
      if (p.alive) this.model.press('action');
      else this.cycleSpectate();
    }
    if (input.justPressed('special') && p.alive) this.model.press('special');
  }

  private step(realDt: number): void {
    if (this.finished) return;
    const m = this.model;
    let dt = realDt;
    if (m.state === 'ended' && !m.online) dt *= this.endTimer < 1.2 ? 0.3 : 1;

    this.map.update(realDt);

    // Hit-stop: un parón minúsculo al golpear (solo offline; online no se puede parar el servidor).
    if (this.hitStopTimer > 0 && !m.online) {
      this.hitStopTimer -= realDt;
      this.render(0);
      return;
    }

    const events = m.update(dt);
    for (const e of events) this.handle(e);
    this.syncViews();
    this.render(dt);
    this.updateCamera();
    this.updateAmbient();

    if (m.state === 'play') {
      const sec = Math.ceil(m.timeLeft);
      if (sec <= 10 && sec > 0 && sec !== this.lastWarnSecond) {
        this.lastWarnSecond = sec;
        audio.play('warning');
      }
    }
    if (m.state === 'ended') {
      this.endTimer += realDt;
      if (this.endTimer > 2.6) this.finish();
    }
  }

  private near(x: number, y: number, extra = 80): boolean {
    const v = this.cameras.main.worldView;
    return x > v.x - extra && x < v.right + extra && y > v.y - extra && y < v.bottom + extra;
  }

  private viewOf(id: number): CharacterView | undefined {
    return this.views.get(id);
  }

  private charOf(id: number): SimChar | undefined {
    return this.model.chars.find((c) => c.id === id);
  }

  /** Convierte los eventos de la simulación en efectos, sonidos y avisos. */
  private handle(e: SimEvent): void {
    const m = this.model;
    const me = this.player;
    const fx = this.fx;
    switch (e.t) {
      case 'countdown':
        this.events.emit('countdown', e.n);
        break;
      case 'release':
        this.events.emit('announce', '¡SALEN LOS AZULES!', TEAM_COLORS.chaser.light, false);
        audio.play('go');
        break;
      case 'end': {
        audio.playMusic(null);
        const won = e.winner === me.team;
        audio.play(won ? 'win' : 'lose');
        this.events.emit('end', e.winner, won);
        if (this.autotest) {
          const alive = m.chars.filter((c) => c.alive && !c.isChaser).length;
          console.info(`[autotest] map=${m.mapId} winner=${e.winner} time=${m.matchTime.toFixed(1)} alive=${alive}`);
        }
        break;
      }
      case 'swing': {
        const c = this.charOf(e.id);
        this.viewOf(e.id)?.onSwing();
        if (!c || !this.near(c.x, c.y)) break;
        audio.play('swing');
        const ang = Math.atan2(c.fy, c.fx);
        const arc = this.add
          .image(c.x + c.fx * 4, c.y - 6 + c.fy * 3, 'fx_arc')
          .setOrigin(4 / 24, 0.5)
          .setRotation(ang)
          .setDepth(c.y + 1)
          .setAlpha(0);
        this.tweens.add({ targets: arc, alpha: { from: 0.95, to: 0 }, scale: { from: 0.9, to: 1.2 }, delay: 50, duration: 170, onComplete: () => arc.destroy() });
        break;
      }
      case 'hit': {
        const v = this.charOf(e.v);
        if (!v) break;
        this.viewOf(e.v)?.onHit();
        const mine = e.v === me.id || e.a === me.id;
        if (this.near(v.x, v.y) || mine) {
          audio.play('hit');
          if (e.v === me.id) audio.play('hurt');
          fx.hit(v.x, v.y - 8, e.nx, e.ny);
          fx.float(v.x, v.y - 17, `-${e.dmg}`, 0xff5a5a);
          if (mine) this.shake(0.009, 140);
          else this.shake(0.0035, 90);
        }
        this.hitStopTimer = Math.max(this.hitStopTimer, BALANCE.hitStop);
        this.events.emit('hit', v);
        break;
      }
      case 'dodge': {
        const v = this.charOf(e.v);
        if (v && this.near(v.x, v.y)) fx.float(v.x, v.y - 18, '¡ESQUIVA!', 0x7cc8ff);
        break;
      }
      case 'block': {
        const v = this.charOf(e.v);
        if (!v || !this.near(v.x, v.y)) break;
        audio.play('block');
        fx.ring(v.x, v.y - 7, 0x7cc8ff, 26);
        fx.hit(v.x, v.y - 8, e.nx, e.ny, [0x7cc8ff, 0xffffff]);
        fx.float(v.x, v.y - 18, '¡BLOQUEO!', 0x7cc8ff);
        break;
      }
      case 'ko': {
        const v = this.charOf(e.v);
        if (!v) break;
        this.viewOf(e.v)?.onKo();
        if (this.near(v.x, v.y) || e.v === me.id) {
          audio.play('ko');
          fx.ko(v.x, v.y - 8);
          this.shake(e.v === me.id ? 0.012 : 0.006, 220);
        }
        const alive = m.chars.filter((c) => c.alive && !c.isChaser).length;
        if (e.v === me.id) {
          this.events.emit('announce', '¡TE HAN PILLADO!', TEAM_COLORS.escapist.light, true);
          this.time.delayedCall(1400, () => {
            if (m.state === 'play') this.events.emit('announce', 'ERES UN FANTASMA: MUÉVETE O CAMBIA DE CÁMARA', 0xc2c3c7, false);
          });
        } else {
          this.events.emit('feed', `${v.name} ELIMINADO`, e.a === me.id ? 0xfee761 : TEAM_COLORS.escapist.light);
          if (e.a === me.id) fx.float(v.x, v.y - 26, '¡PILLADO!', 0xfee761, true);
        }
        if (alive > 0) this.events.emit('feed', `QUEDAN ${alive}`, 0x8b9bb4);
        break;
      }
      case 'dash': {
        const c = this.charOf(e.id);
        if (c && this.near(c.x, c.y)) {
          audio.play('dash');
          fx.dashBurst(c.x, c.y + 2);
        }
        break;
      }
      case 'throw': {
        const c = this.charOf(e.id);
        if (c && this.near(c.x, c.y)) audio.play('throw');
        break;
      }
      case 'projEnd':
        if (this.near(e.x, e.y)) {
          if (e.thud) audio.play('thud');
          fx.debrisAt(e.x, e.y - 6, [0xc2414b, 0xf6dcc0, 0x7a3b22]);
        }
        break;
      case 'smoke':
        if (this.near(e.x, e.y)) {
          audio.play('smoke');
          for (let i = 0; i < 6; i++) {
            const a = (i / 6) * Math.PI * 2;
            fx.smokePuff(e.x + Math.cos(a) * 10, e.y + Math.sin(a) * 8 - 4, 3);
          }
        }
        break;
      case 'itemSpawn':
        fx.sparkle(e.x, e.y - 4, PICKUP_COLORS[e.type]);
        if (this.near(e.x, e.y, 120)) audio.play('spawn');
        break;
      case 'pickup': {
        const c = this.charOf(e.id);
        fx.sparkle(e.x, e.y - 4, PICKUP_COLORS[e.type]);
        if (e.type === 'medkit') {
          if (this.near(e.x, e.y)) audio.play('heal');
          if (c) fx.float(c.x, c.y - 18, `+${BALANCE.items.medkitHeal}`, 0x63c74d);
        } else if (this.near(e.x, e.y)) audio.play('pickup');
        if (e.id === me.id) this.events.emit('feed', `¡${PICKUP_NAMES[e.type]}!`, PICKUP_COLORS[e.type]);
        break;
      }
      case 'say': {
        const c = this.charOf(e.id);
        if (!c) break;
        this.viewOf(e.id)?.say(e.p, c);
        const d = Math.hypot(c.x - me.x, c.y - me.y);
        voice.say(e.p, c.team, d, e.id === me.id);
        break;
      }
    }
  }

  /** Crea y destruye las vistas según lo que hay en el modelo. */
  private syncViews(): void {
    const m = this.model;
    const showNames = m.online;
    for (const c of m.chars) {
      if (!this.views.has(c.id)) this.views.set(c.id, new CharacterView(this, c, c.id === m.playerId, showNames));
    }
    const seenP = new Set<number>();
    for (const p of m.pickups) {
      seenP.add(p.iid);
      if (!this.pickupViews.has(p.iid)) this.pickupViews.set(p.iid, new PickupView(this, p));
    }
    for (const [iid, v] of this.pickupViews) {
      if (!seenP.has(iid)) {
        v.destroy();
        this.pickupViews.delete(iid);
      }
    }
    const seenJ = new Set<number>();
    for (const p of m.projectiles) {
      seenJ.add(p.pid);
      if (!this.projViews.has(p.pid)) this.projViews.set(p.pid, new ProjectileView(this, p));
    }
    for (const [pid, v] of this.projViews) {
      if (!seenJ.has(pid)) {
        v.destroy();
        this.projViews.delete(pid);
      }
    }
  }

  private render(dt: number): void {
    const m = this.model;
    const viewer = this.player;
    for (const c of m.chars) {
      let hidden = false;
      if (c !== viewer && c.team !== viewer.team && c.inBush) {
        hidden = Math.hypot(c.x - viewer.x, c.y - viewer.y) > BALANCE.terrain.bushRevealDistance;
      }
      this.views.get(c.id)?.update(dt, c, hidden, m.grid, this.fx);
    }
    for (const p of m.pickups) this.pickupViews.get(p.iid)?.update(dt, p);
    for (const p of m.projectiles) this.projViews.get(p.pid)?.update(dt, p);
    // humo continuo de las bombas
    this.smokePuff -= dt;
    if (this.smokePuff <= 0) {
      this.smokePuff = 0.07;
      for (const s of m.smokes) {
        if (s.life < 0.4) continue;
        const a = Math.random() * Math.PI * 2;
        const r = Math.random() * s.radius * 0.85;
        this.fx.smokePuff(s.x + Math.cos(a) * r, s.y + Math.sin(a) * r * 0.8 - 4, 1);
      }
    }
    // el arbusto en el que está el jugador se vuelve translúcido
    const bush = viewer.alive && viewer.inBush ? this.map.bushAt(viewer.x, viewer.y) ?? null : null;
    if (bush !== this.lastBush) {
      this.lastBush?.setAlpha(0.95);
      bush?.setAlpha(0.5);
      this.lastBush = bush;
    }
  }

  private updateCamera(): void {
    const p = this.player;
    let t: SimChar = p;
    if (!p.alive && this.spectate) {
      if (!this.spectate.alive || Math.hypot(p.intent.mx, p.intent.my) > 0.1) this.spectate = null;
      else t = this.spectate;
    }
    this.camTarget.set(t.x, t.y - 4);
  }

  private updateAmbient(): void {
    const v = this.cameras.main.worldView;
    this.ambient.setPosition(v.x, v.y);
  }

  shake(intensity: number, duration = 120): void {
    this.cameras.main.shake(duration, intensity, true);
  }

  // ------------------------------------------------------------------ fin de partida

  private finish(): void {
    if (this.finished) return;
    this.finished = true;
    const m = this.model;
    const data: ResultsData = {
      mapId: m.mapId,
      role: this.player.team,
      winner: m.winner ?? 'escapist',
      timePlayed: m.matchTime,
      duration: m.duration,
      online: m.online,
      entries: m.chars.map((c) => ({ name: c.name, team: c.team, isPlayer: c.id === m.playerId, alive: c.alive, stats: { ...c.stats }, look: c.look })),
    };
    this.scene.stop('UI');
    if (this.autotest) {
      this.scene.restart({ mapId: m.mapId, role: this.data_.role });
      return;
    }
    // Online, el modelo sigue vivo: los resultados vuelven después al lobby.
    this.scene.start('Results', { ...data, model: m.online ? m : undefined });
  }

  private openPause(): void {
    audio.play('click');
    input.consume();
    // Online la partida no se puede parar: la pausa es solo un menú encima.
    if (!this.model.online) {
      this.scene.pause();
      this.scene.pause('UI');
    }
    this.scene.launch('Pause', { online: this.model.online });
    this.scene.bringToTop('Pause');
  }

  restartMatch(): void {
    if (this.model.online) return;
    this.scene.stop('UI');
    this.scene.restart({ mapId: this.model.mapId, role: this.data_.role });
  }
}
