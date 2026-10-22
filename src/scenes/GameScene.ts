import Phaser from 'phaser';
import { BALANCE } from '../config/balance';
import { settings } from '../config/settings';
import { profile } from '../config/profile';
import { audio } from '../core/audio';
import { input } from '../core/input';
import { voice } from '../core/voice';
import { HYPE } from '../../shared/balance';
import { botName, Look, randomLook } from '../../shared/look';
import { BiomeId, MapId, styleOf } from '../../shared/maps';
import { scaleFor } from '../../shared/mapScale';
import { defaultHunters, modeInfo } from '../../shared/modes/rules';
import type { SimChar } from '../../shared/sim/Char';
import type { ModeId, RosterEntry, SimEvent, Stats, Team } from '../../shared/sim/types';
import { CharacterView, CharStyle, ViewCtx } from '../game/CharacterView';
import { GameModel, OfflineModel } from '../game/model';
import { OnlineModel } from '../net/OnlineModel';
import { account } from '../net/account';
import { PICKUP_COLORS, PICKUP_NAMES, PickupView, ProjectileView, PropView } from '../game/views';
import type { Outfit } from '../gfx/characters';
import { Fx } from '../gfx/fx';
import { TEAM_COLORS } from '../gfx/palette';
import { GLOBAL_LABELS, PRIZE_LABELS } from '../ui/hype';
import { hitBurst } from '../game/cosmetics';
import { shake as shakeFx } from '../core/feel';
import type { MgHost } from './MinigameScene';
import { PERKS } from '../../shared/minigames';
import { COSMETICS, Equipped } from '../../shared/economy';
import { GameMap } from '../world/GameMap';
import { quality } from '../core/quality';
import { updateDoors } from '../../shared/house';
import { viewSize } from './common';

export interface GameData {
  mode?: ModeId;
  mapId?: MapId;
  role?: Team;
  /** Partida online ya preparada (si no, se crea una partida offline con bots). */
  model?: GameModel;
}

/** Atuendo de cada personaje según el modo y la ciudad. */
export function outfitFor(mode: ModeId, style: BiomeId, team: Team): Outfit {
  if (mode === 'bomba') return 'casual';
  if (mode === 'infeccion') return team === 'chaser' ? 'zombie' : 'guchi';
  if (team === 'escapist') return 'guchi';
  // Las Vegas: seguridad del casino (mismo uniforme que la policía de París).
  return style === 'paris' || style === 'vegas' ? 'police' : style === 'ceuta' ? 'military' : style === 'barcelona' ? 'street' : 'blue';
}

const HINT_SFX = ['hintWhistle', 'hintGiggle', 'hintOink', 'hintSqueak'] as const;

/** Los bots también llevan algún cosmético (para que se vea la tienda en acción). */
export function botCos(): Equipped {
  const out: Equipped = { emote: 'emote_jamon', dance: 'dance_salto' };
  for (const cat of ['hat', 'trail', 'hit', 'frame', 'dance'] as const) {
    if (Math.random() > 0.35) continue;
    const items = COSMETICS.filter((c) => c.cat === cat);
    out[cat] = items[Math.floor(Math.random() * items.length)].id;
  }
  return out;
}

export interface ResultEntry {
  /** Cosméticos (para el baile del MVP). */
  cos?: Equipped;
  name: string;
  team: Team;
  isPlayer: boolean;
  alive: boolean;
  stats: Stats;
  look: Look;
}

export interface ResultsData {
  mode: ModeId;
  mapId: MapId;
  role: Team;
  winner: Team;
  /** Ganador individual (Jamón Bomba / Leyenda). */
  champion: string | null;
  /** Cómo te fue en el Parón. */
  paron: { mg: string; place: number; label: string; won: boolean } | null;
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
  private propViews: PropView[] = [];
  private barrierViews = new Map<number, Phaser.GameObjects.Image>();
  private style!: CharStyle;
  private bigHeads = false;

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
    this.propViews = [];
    this.barrierViews = new Map();
    this.bigHeads = false;
    const params = new URLSearchParams(window.location.search);
    this.autotest = params.has('autotest') && !data.model;
    this.simSpeed = this.autotest ? Math.max(1, Math.min(8, Number(params.get('speed') ?? 4))) : 1;
  }

  create(): void {
    this.cameras.main.fadeIn(250, 13, 11, 20);
    this.model = this.data_.model ?? this.createOffline();
    account.xpAtStart = account.profile?.xp ?? null;

    const style = styleOf(this.model.mapId);
    this.map = new GameMap(this, style, this.model.grid);
    this.map.addFountain();
    this.fx = new Fx(this, style);
    this.createAmbient();
    const mode = this.model.mode;
    this.style = {
      outfit: (c) => outfitFor(mode, style, c.team),
      hasHam: (c) => c.team === 'chaser' && (mode === 'pilla' || mode === 'escondite'),
      indicator: (c) => (mode === 'bomba' ? 'ind_neutral' : mode === 'infeccion' && c.team === 'chaser' ? 'ind_infected' : c.isChaser ? 'ind_chaser' : 'ind_escapist'),
    };
    // Objetos del Escondite (mismo dibujo que los escondidos disfrazados).
    for (const pr of this.model.props) this.propViews.push(new PropView(this, pr.x, pr.y, pr.k, pr.rot));

    const cam = this.cameras.main;
    cam.setRoundPixels(true);
    const p = this.player;
    this.camTarget.set(p.x, p.y);
    cam.startFollow(this.camTarget, true, 0.14, 0.14);
    this.applyView();
    cam.centerOn(p.x, p.y);
    this.scale.on(Phaser.Scale.Events.RESIZE, this.onResize, this);

    audio.setTempo(1);
    audio.playMusic(this.track());
    this.scene.launch('UI');
    this.scene.bringToTop('UI');
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.cleanup());
    if (!this.model.online) this.time.delayedCall(10, () => this.events.emit('countdown', BALANCE.match.countdown));
  }

  private createOffline(): GameModel {
    const mode: ModeId = this.data_.mode ?? 'pilla';
    let role: Team = this.data_.role ?? 'escapist';
    const mapId: MapId = this.data_.mapId ?? 'forest';
    let nCh = settings.chasers;
    let nEs = settings.escapists;
    if (mode !== 'pilla') {
      // Mismo total de personajes; el modo decide cuántos cazadores.
      const total = nCh + nEs;
      nCh = Math.max(1, defaultHunters(mode, total));
      nEs = total - nCh;
      if (mode === 'bomba') role = 'escapist';
    }
    const playerIndex = Math.floor(Math.random() * (role === 'chaser' ? nCh : nEs));
    const myCos = account.profile?.equipped ?? {};
    const myStreak = account.profile?.mgStreak ?? 0;
    const roster: RosterEntry[] = [];
    let id = 0;
    let botI = Math.floor(Math.random() * 20);
    for (let i = 0; i < nCh; i++) {
      const me = role === 'chaser' && i === playerIndex;
      const name = botName(botI++);
      roster.push({ id: id++, team: 'chaser', name: me ? profile.look.name : name, look: me ? profile.look : randomLook(name), human: me && !this.autotest, cos: me ? myCos : botCos(), streak: me ? myStreak : 0 });
    }
    for (let i = 0; i < nEs; i++) {
      const me = role === 'escapist' && i === playerIndex;
      const name = botName(botI++);
      roster.push({ id: id++, team: 'escapist', name: me ? profile.look.name : name, look: me ? profile.look : randomLook(name), human: me && !this.autotest, cos: me ? myCos : botCos(), streak: me ? myStreak : 0 });
    }
    const playerId = roster.find((r) => r.team === role && (r.human || this.autotest))!.id;
    const pid = this.autotest ? roster.filter((r) => r.team === role)[playerIndex].id : playerId;
    // En los modos nuevos, la duración por defecto es la del modo si no se ha cambiado.
    const info = modeInfo(mode);
    const duration = mode === 'pilla' || settings.duration !== BALANCE.match.defaultDuration ? settings.duration : info.duration || settings.duration;
    return new OfflineModel({ mode, mapId, scale: scaleFor(roster.length, mapId), duration, difficulty: settings.difficulty, roster, paron: settings.paron }, pid);
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
    const id = styleOf(this.model.mapId);
    const cfg: Phaser.Types.GameObjects.Particles.ParticleEmitterConfig =
      id === 'snow'
        ? { x: { min: -20, max: 1000 }, y: -6, lifespan: 6000, speedY: { min: 14, max: 30 }, speedX: { min: -10, max: 6 }, scale: { min: 1, max: 2 }, alpha: { min: 0.6, max: 1 }, frequency: 50, tint: 0xffffff }
        : id === 'desert'
          ? { x: -10, y: { min: 0, max: 600 }, lifespan: 4500, speedX: { min: 50, max: 90 }, speedY: { min: -6, max: 6 }, scale: { min: 1, max: 2 }, alpha: { start: 0.55, end: 0 }, frequency: 90, tint: 0xfff1c4 }
          : id === 'paris'
            ? { x: { min: -20, max: 1000 }, y: -6, lifespan: 1400, speedY: { min: 220, max: 300 }, speedX: { min: -30, max: -20 }, scaleX: 1, scaleY: { min: 2, max: 4 }, alpha: { min: 0.25, max: 0.5 }, frequency: 25, tint: 0xb8c7e0 }
            : id === 'barcelona'
              ? { x: { min: 0, max: 1000 }, y: { min: 0, max: 600 }, lifespan: 2500, speedY: { min: -8, max: -2 }, scale: { start: 1.5, end: 0 }, alpha: { start: 0.8, end: 0 }, frequency: 160, tint: [0xfee761, 0xffffff] }
              : id === 'vegas'
                ? { x: { min: 0, max: 1000 }, y: { min: 0, max: 600 }, lifespan: 1600, speedY: { min: -6, max: 6 }, speedX: { min: -6, max: 6 }, scale: { start: 1.5, end: 0 }, alpha: { start: 0.9, end: 0 }, frequency: 90, tint: [0xff4fd8, 0x3ff0ff, 0xfee761, 0xb26bff] }
                : id === 'casa'
                  ? { x: { min: 0, max: 1000 }, y: { min: 0, max: 600 }, lifespan: 5000, speedY: { min: -3, max: 3 }, speedX: { min: 2, max: 6 }, scale: 1, alpha: { start: 0.5, end: 0 }, frequency: 220, tint: [0xf4f0e8, 0xd9cfb8] }
          : { x: { min: 0, max: 1000 }, y: -6, lifespan: 7000, speedY: { min: 10, max: 22 }, speedX: { min: -16, max: 16 }, rotate: { min: 0, max: 360 }, scale: 1, alpha: { min: 0.7, max: 1 }, frequency: 350, tint: [0x63c74d, 0xfeae34, 0x3e8948] };
    // Sigue a la vista de la cámara (en coordenadas del mundo).
    this.ambient = this.add.particles(0, 0, id === 'forest' ? 'p_leaf' : 'p_dot', cfg).setDepth(9800);
  }

  private cleanup(): void {
    this.scale.off(Phaser.Scale.Events.RESIZE, this.onResize, this);
    this.scene.stop('Minigame');
    for (const v of this.views.values()) v.destroy();
    for (const v of this.pickupViews.values()) v.destroy();
    for (const v of this.projViews.values()) v.destroy();
    for (const v of this.propViews) v.destroy();
    for (const v of this.barrierViews.values()) v.destroy();
    this.propViews = [];
    this.barrierViews.clear();
    audio.setTempo(1);
    this.views.clear();
    this.pickupViews.clear();
    this.projViews.clear();
    voice.stop();
    if (!this.finished) this.model?.destroy();
  }

  cycleSpectate(): void {
    const mode = this.model.mode;
    const alive = this.model.chars.filter((c) => c.free && (mode === 'bomba' || mode === 'infeccion' || !c.isChaser));
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
    // Durante el Parón la partida está congelada: las teclas van al minijuego.
    if (this.model.paron()) {
      this.model.setHeld({ mx: 0, my: 0, sprint: false });
      return;
    }
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
    if (input.justPressed('rotate') && p.alive) this.model.press('rotate');
    if (input.justPressed('emote')) this.model.emote();
    if (input.justPressed('spin') && p.alive) {
      if (p.spinsLeft > 0 && this.model.matchTime >= HYPE.personalFrom && this.model.state === 'play') this.model.press('spin');
      else audio.play('denied');
    }
  }

  private step(realDt: number): void {
    if (this.finished) return;
    const m = this.model;
    let dt = realDt;
    if (m.state === 'ended' && !m.online) dt *= this.endTimer < 1.2 ? 0.3 : 1;

    this.map.update(realDt);
    // Calidad automática: si el móvil no llega, fuera el ambiente y menos partículas.
    quality.sample(realDt);
    if (quality.low && this.ambient.emitting) this.ambient.stop();

    // Hit-stop: un parón minúsculo al golpear (solo offline; online no se puede parar el servidor).
    if (this.hitStopTimer > 0 && !m.online) {
      this.hitStopTimer -= realDt;
      this.render(0);
      return;
    }

    const events = m.update(dt);
    for (const e of events) this.handle(e);
    // ¡Parón! Se abre la capa del minijuego encima de la partida congelada.
    if (m.paron() && !this.scene.isActive('Minigame') && !this.scene.isPaused('Minigame')) this.launchMinigame();
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
        this.events.emit('announce', m.mode === 'infeccion' ? '¡EL INFECTADO SE DESPIERTA!' : '¡SALEN LOS AZULES!', m.mode === 'infeccion' ? 0x9cff5a : TEAM_COLORS.chaser.light, false);
        audio.play('go');
        break;
      case 'end': {
        audio.playMusic(null);
        audio.setTempo(1);
        const champ = e.ch !== undefined && e.ch >= 0 ? this.charOf(e.ch) : undefined;
        const won = m.mode === 'bomba' ? e.ch === me.id : e.winner === me.team;
        audio.play(won ? 'win' : 'lose');
        let sub: string | undefined;
        if (m.mode === 'bomba') sub = champ ? `¡${champ.name} ES EL ÚLTIMO EN PIE!` : 'NADIE SOBREVIVE';
        else if (m.mode === 'infeccion' && e.winner === 'escapist' && champ) sub = `¡${champ.name} ES UNA LEYENDA!`;
        this.events.emit('end', e.winner, won, sub);
        if (won) {
          this.fx.confetti(me.x, me.y - 30, 60);
          this.events.emit('burst', 80);
        }
        // Cámara lenta y zoom de medio segundo en el momento clave.
        if (!settings.reduceFx) {
          const cam = this.cameras.main;
          const z = cam.zoom;
          cam.zoomTo(z * 1.25, 250, 'Sine.easeOut');
          this.time.delayedCall(700, () => cam.zoomTo(z, 400, 'Sine.easeInOut'));
          this.tweens.timeScale = 0.4;
          this.time.delayedCall(500, () => (this.tweens.timeScale = 1));
        }
        input.rumble(won ? 0.6 : 0.3, 400);
        if (this.autotest) {
          const alive = m.chars.filter((c) => c.alive && !c.isChaser).length;
          const coins = m.chars.reduce((a, c) => a + c.stats.coins, 0);
          console.info(`[autotest] mode=${m.mode} map=${m.mapId} winner=${e.winner} ch=${e.ch ?? -1} time=${m.matchTime.toFixed(1)} alive=${alive} coins=${coins}`);
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
          hitBurst(this, v.x, v.y - 8, this.charOf(e.a)?.cos.hit);
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
      case 'trap': {
        // Pillado: queda "enjamonado" esperando a que le rescaten.
        const v = this.charOf(e.v);
        if (!v) break;
        if (this.near(v.x, v.y) || e.v === me.id) {
          audio.play('ko');
          fx.ko(v.x, v.y - 8);
          fx.debrisAt(v.x, v.y - 10, [0xc2414b, 0xf6dcc0, 0x7a3b22]);
          this.shake(e.v === me.id ? 0.012 : 0.006, 220);
        }
        const free = m.chars.filter((c) => c.free && !c.isChaser).length;
        if (e.v === me.id) {
          this.events.emit('announce', '¡TE HAN ENJAMONADO!', TEAM_COLORS.escapist.light, true);
          this.time.delayedCall(1300, () => {
            if (m.state === 'play' && me.trapped > 0) this.events.emit('announce', 'AGUANTA: UN COMPAÑERO PUEDE RESCATARTE', 0xfee761, false);
          });
        } else {
          this.events.emit('feed', `${v.name} ENJAMONADO`, e.a === me.id ? 0xfee761 : TEAM_COLORS.escapist.light);
          if (e.a === me.id) fx.float(v.x, v.y - 26, '¡PILLADO!', 0xfee761, true);
          else if (!me.isChaser && me.free) this.events.emit('feed', `¡RESCATA A ${v.name}!`, 0x63c74d);
        }
        if (free > 0) this.events.emit('feed', `QUEDAN ${free} LIBRES`, 0x8b9bb4);
        break;
      }
      case 'rescue': {
        const v = this.charOf(e.v);
        const by = this.charOf(e.by);
        if (!v) break;
        if (this.near(v.x, v.y) || e.v === me.id || e.by === me.id) {
          audio.play('heal');
          fx.sparkle(v.x, v.y - 8, 0x63c74d);
          fx.ring(v.x, v.y - 8, 0x63c74d, 30);
          fx.float(v.x, v.y - 24, '¡LIBRE!', 0x63c74d, true);
        }
        if (e.v === me.id) this.events.emit('announce', '¡TE HAN RESCATADO!', 0x63c74d, true);
        else if (e.by === me.id) this.events.emit('announce', '¡RESCATE!', 0x63c74d, true);
        this.events.emit('feed', `${by?.name ?? '?'} LIBERA A ${v.name}`, 0x63c74d);
        break;
      }
      case 'streak': {
        const c = this.charOf(e.id);
        const label = e.n === 2 ? '¡DOBLE PILLADA!' : e.n === 3 ? '¡TRIPLE PILLADA!' : `¡PILLADA X${e.n}!`;
        audio.play('reveal');
        this.events.emit('announce', `${label} ${c?.name ?? ''}`, TEAM_COLORS.chaser.light, true);
        if (c) fx.ring(c.x, c.y - 8, 0xfee761, 40);
        break;
      }
      case 'metro': {
        if (this.near(e.x0, e.y0) || this.near(e.x1, e.y1)) {
          audio.play('dash');
          fx.smokePuff(e.x0, e.y0 - 4, 5);
          fx.smokePuff(e.x1, e.y1 - 4, 5);
          fx.ring(e.x1, e.y1 - 6, 0xf2c230, 22);
        }
        if (e.id === me.id) this.events.emit('feed', styleOf(m.mapId) === 'vegas' ? '¡ASCENSOR! CAMBIAS DE PLANTA DEL PARKING' : '¡METRO! APARECES EN OTRA ESTACIÓN', 0xf2c230);
        break;
      }
      case 'jackpot':
        if (this.near(e.x, e.y)) {
          audio.play('jackpot');
          fx.ring(e.x, e.y - 12, 0xfee761, 34);
          fx.ring(e.x, e.y - 12, 0xff4fd8, 22);
          this.events.emit('feed', '¡PREMIO GORDO EN UNA TRAGAPERRAS!', 0xfee761);
        }
        break;
      case 'light': {
        const c = this.charOf(e.id);
        if (c && this.near(c.x, c.y)) audio.play('click');
        if (e.id === me.id) this.events.emit('feed', e.on ? 'LUZ ENCENDIDA' : 'LUZ APAGADA', e.on ? 0xfee761 : 0x8b9bb4);
        break;
      }
      case 'ko': {
        // Se acabó el tiempo atrapado: fuera de la partida.
        const v = this.charOf(e.v);
        if (!v) break;
        this.viewOf(e.v)?.onKo();
        if (this.near(v.x, v.y) || e.v === me.id) {
          audio.play('lose');
          fx.ko(v.x, v.y - 8);
        }
        const free = m.chars.filter((c) => c.free && !c.isChaser).length;
        if (e.v === me.id) {
          this.events.emit('announce', 'NADIE LLEGÓ... ERES UN FANTASMA', 0xc2c3c7, true);
          this.time.delayedCall(1400, () => {
            if (m.state === 'play') this.events.emit('announce', 'MUÉVETE O CAMBIA DE CÁMARA', 0xc2c3c7, false);
          });
        } else this.events.emit('feed', `${v.name} FUERA`, 0x8b9bb4);
        if (free > 0) this.events.emit('feed', `QUEDAN ${free} LIBRES`, 0x8b9bb4);
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
        if (e.type === 'gold') {
          audio.play('win');
          this.events.emit('announce', `¡JAMÓN DE ORO! ${c?.name ?? ''} LIBERA A TODOS`, 0xffd23f, true);
        }
        break;
      }
      case 'infect': {
        const v = this.charOf(e.v);
        if (!v) break;
        if (this.near(v.x, v.y) || e.v === me.id) {
          audio.play('infect');
          fx.infect(v.x, v.y - 8);
          this.shake(e.v === me.id ? 0.012 : 0.004, 200);
        }
        const by = this.charOf(e.a);
        if (e.v === me.id) {
          this.events.emit('announce', '¡TE HAN INFECTADO! AHORA CONTAGIA', 0x9cff5a, true);
          this.events.emit('flash', 0x63c74d, 0.45);
        } else if (e.a === me.id) {
          fx.float(v.x, v.y - 26, '¡CONTAGIADO!', 0x9cff5a, true);
          this.events.emit('announce', `¡HAS INFECTADO A ${v.name}!`, 0x9cff5a, false);
        } else this.events.emit('feed', `${by?.name ?? '?'} INFECTA A ${v.name}`, 0x9cff5a);
        break;
      }
      case 'last': {
        const c = this.charOf(e.id);
        audio.play('alarm');
        if (e.id === me.id) this.events.emit('announce', '¡ERES EL ÚLTIMO SUPERVIVIENTE!', 0xff5a5a, true);
        else this.events.emit('announce', `¡ÚLTIMO SUPERVIVIENTE: ${c?.name ?? '?'}!`, 0xff5a5a, true);
        this.events.emit('flash', 0xff3a3a, 0.3);
        break;
      }
      case 'round': {
        audio.play('reveal');
        const names = e.ids.map((id) => this.charOf(id)?.name ?? '?').join(' Y ');
        this.events.emit('announce', `RONDA ${e.n}: ${e.ids.includes(me.id) ? '¡TIENES EL JAMÓN!' : `LO LLEVA ${names}`}`, 0xfeae34, true);
        for (const id of e.ids) {
          const c = this.charOf(id);
          if (c) fx.ring(c.x, c.y - 10, 0xfeae34, 40);
        }
        if (e.ids.includes(me.id)) this.events.emit('flash', 0xff3a3a, 0.35);
        break;
      }
      case 'pass': {
        const a = this.charOf(e.from);
        const b = this.charOf(e.to);
        if (b && (this.near(b.x, b.y) || e.to === me.id || e.from === me.id)) {
          audio.play('pass');
          fx.ring(b.x, b.y - 10, 0xfeae34, 26);
          fx.float(b.x, b.y - 30, '¡PARA TI!', 0xfeae34);
        }
        if (e.to === me.id) {
          this.events.emit('announce', `¡${a?.name ?? '?'} TE PASA EL JAMÓN!`, 0xff5a5a, true);
          this.events.emit('flash', 0xff3a3a, 0.3);
          this.shake(0.006, 140);
        } else if (e.from === me.id) this.events.emit('announce', '¡QUITADO DE ENCIMA!', 0x63c74d, false);
        break;
      }
      case 'boom': {
        const c = this.charOf(e.id);
        audio.play('boom');
        fx.explosion(e.x, e.y - 8);
        this.shake(this.near(e.x, e.y) ? 0.02 : 0.006, 380);
        if (e.id === me.id) {
          this.events.emit('announce', '¡BUM! TE HA EXPLOTADO EL JAMÓN', 0xff5a5a, true);
          this.events.emit('flash', 0xffffff, 0.8);
        } else this.events.emit('announce', `¡BUM! ${c?.name ?? '?'} ELIMINADO`, 0xfeae34, true);
        break;
      }
      case 'seek':
        audio.play('go');
        this.events.emit('announce', me.isChaser ? '¡A BUSCAR! GOLPEA LO SOSPECHOSO' : '¡YA VIENEN! NO TE MUEVAS', TEAM_COLORS.chaser.light, true);
        break;
      case 'hint': {
        const c = this.charOf(e.id);
        if (!c) break;
        const d = Math.hypot(e.x - me.x, e.y - me.y);
        if (d < 260 || e.id === me.id) audio.play(HINT_SFX[e.s % HINT_SFX.length]);
        const img = this.add.image(e.x, e.y - 22, 'p_hint').setDepth(9500).setScale(0.5);
        this.tweens.add({ targets: img, scale: 1.5, y: e.y - 34, alpha: 0, duration: 1400, ease: 'Cubic.easeOut', onComplete: () => img.destroy() });
        fx.ring(e.x, e.y - 6, 0xfee761, 28);
        if (e.id === me.id) this.events.emit('feed', '¡HAS HECHO RUIDO! (PISTA)', 0xfee761);
        break;
      }
      case 'miss': {
        const pv = this.propViews[e.pid];
        pv?.hit();
        if (pv && this.near(pv.x, pv.y)) {
          audio.play('miss');
          fx.float(pv.x, pv.y - 22, '¡ERA REAL!', 0xff5a5a);
          fx.debrisAt(pv.x, pv.y - 6, [0x8b9bb4, 0xc2c3c7]);
        }
        if (e.id === me.id) {
          this.events.emit('flash', 0xe43b44, 0.25);
          this.events.emit('feed', `OBJETO DE VERDAD: -${8} VIDA`, 0xff5a5a);
        }
        break;
      }
      case 'disguise': {
        const c = this.charOf(e.id);
        if (!c) break;
        if (this.near(c.x, c.y)) audio.play('poof');
        fx.smokePuff(c.x, c.y - 4, 5);
        if (e.k < 0 && this.near(c.x, c.y)) fx.float(c.x, c.y - 26, '¡ENCONTRADO!', 0xfee761, true);
        if (e.k < 0 && e.id === me.id) this.events.emit('announce', '¡TE HAN ENCONTRADO! ¡CORRE!', 0xff5a5a, true);
        break;
      }
      case 'barrier':
        for (const t of e.tiles) {
          if (e.on) {
            const c = m.grid.tileCenter(t);
            const img = this.add.image(c.x, c.y + 8, 'barrier_tile').setOrigin(0.5, 1).setDepth(c.y + 7).setScale(1, 0);
            this.tweens.add({ targets: img, scaleY: 1, duration: 160, ease: 'Back.easeOut' });
            this.barrierViews.get(t)?.destroy();
            this.barrierViews.set(t, img);
            fx.dustAt(c.x, c.y + 6, 3);
          } else {
            const img = this.barrierViews.get(t);
            if (img) this.tweens.add({ targets: img, alpha: 0, duration: 200, onComplete: () => img.destroy() });
            this.barrierViews.delete(t);
          }
        }
        if (e.on) audio.play('block');
        break;
      case 'coin': {
        const c = this.charOf(e.id);
        if (e.id === me.id) {
          this.events.emit('coin', e.n, e.c);
          if (c) fx.float(c.x, c.y - 30, e.c > 1 ? `+${e.n} X${e.c}` : `+${e.n}`, 0xffd23f);
        }
        break;
      }
      case 'medal':
        if (e.id === me.id) this.events.emit('medal', e.m);
        break;
      case 'roulette': {
        if (e.kind === 'global') this.events.emit('roulette', 'global', e.r, '¡RULETA PARA TODOS!');
        else if (e.id === me.id) this.events.emit('roulette', 'me', e.r, 'TU RULETA');
        else this.events.emit('feed', `${this.charOf(e.id)?.name ?? '?'} TIRA DE LA RULETA`, 0xffd23f);
        break;
      }
      case 'effect': {
        if (e.id < 0) {
          if (e.e === 'cabezones') this.bigHeads = e.on;
          if (e.on) {
            this.events.emit('announce', `¡${GLOBAL_LABELS[e.e] ?? e.e}!`, 0xff7ab8, true);
            this.shake(0.004, 200);
          }
        } else if (e.on) {
          const c = this.charOf(e.id);
          if (c) {
            fx.sparkle(c.x, c.y - 10, 0xffd23f);
            if (e.id !== me.id) this.events.emit('feed', `${c.name}: ${PRIZE_LABELS[e.e] ?? e.e}`, 0xffd23f);
            else fx.confetti(c.x, c.y - 20, 30);
          }
        }
        break;
      }
      case 'emote':
        this.viewOf(e.id)?.showEmote(e.e);
        break;
      case 'paron':
        audio.playMusic(null);
        break;
      case 'resume': {
        audio.playMusic(this.track());
        const perk = PERKS.find((p) => p.id === me.perk);
        this.events.emit('announce', perk ? `¡VENTAJA: ${perk.name}!` : '¡SEGUIMOS!', perk ? 0x63c74d : 0xfee761, true);
        if (perk) fx.ring(me.x, me.y - 8, 0x63c74d, 40);
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
      if (!this.views.has(c.id)) this.views.set(c.id, new CharacterView(this, c, c.id === m.playerId, showNames, this.style));
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

  /** Música de la partida (Las Vegas tiene la suya). */
  private track(): 'game' | 'vegas' {
    return styleOf(this.model.mapId) === 'vegas' ? 'vegas' : 'game';
  }

  private render(dt: number): void {
    const m = this.model;
    const viewer = this.player;
    const ms = m.modeNet();
    // La casa: las puertas se abren al acercarse alguien y los interruptores muestran la luz.
    if (m.grid.doorTiles.length) {
      updateDoors(m.grid, m.chars);
      this.map.syncDoors();
      this.map.syncLights(ms.lt);
    }
    for (const c of m.chars) {
      let hidden = false;
      // En Jamón Bomba no hay equipos: todos son "enemigos".
      const enemy = c !== viewer && (m.mode === 'bomba' || c.team !== viewer.team) && viewer.alive;
      if (enemy && c.inBush) {
        hidden = Math.hypot(c.x - viewer.x, c.y - viewer.y) > BALANCE.terrain.bushRevealDistance;
      }
      const bi = c.bomb ? ms.b.indexOf(c.id) : -1;
      const vc: ViewCtx = { viewer, urgency: bi >= 0 ? ms.b[bi + 1] : -1, bigHeads: this.bigHeads, enemy };
      this.views.get(c.id)?.update(dt, c, hidden, m.grid, this.fx, vc);
      // Infectados: rastro de partículas verdes.
      if (m.mode === 'infeccion' && c.alive && c.team === 'chaser' && Math.random() < dt * 3 && this.near(c.x, c.y)) this.fx.infect(c.x, c.y - 6, 1);
    }
    for (const pv of this.propViews) pv.update(dt);
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
    shakeFx(this, intensity, duration);
  }

  // ------------------------------------------------------------------ fin de partida

  private finish(): void {
    if (this.finished) return;
    const m = this.model;
    let data: ResultsData;
    const me = this.player;
    if (m instanceof OnlineModel) {
      // Online, las estadísticas las manda el servidor al acabar.
      const r = m.results;
      if (!r) return;
      const champ = r.entries.find((e) => e.id === r.champion);
      data = {
        mode: m.mode,
        champion: champ ? champ.name : null,
        paron: this.paronSummary(m.lastParon, me.id),
        mapId: m.mapId,
        role: this.player.team,
        winner: r.winner,
        timePlayed: r.timePlayed,
        duration: r.duration,
        online: true,
        entries: r.entries.map((e) => ({ name: e.name, team: e.team, isPlayer: e.id === m.playerId, alive: e.alive, stats: e.stats, look: e.look, cos: m.chars.find((c) => c.id === e.id)?.cos })),
      };
    } else {
      const champ = m.chars.find((c) => c.id === m.champion);
      data = {
        mode: m.mode,
        champion: champ ? champ.name : null,
        paron: this.paronSummary((m as OfflineModel).lastParon ? { mg: (m as OfflineModel).lastParon!.def.id, res: (m as OfflineModel).lastParon!.results } : null, me.id),
        mapId: m.mapId,
        role: this.player.team,
        winner: m.winner ?? 'escapist',
        timePlayed: m.matchTime,
        duration: m.duration,
        online: false,
        entries: m.chars.map((c) => ({ name: c.name, team: c.team, isPlayer: c.id === m.playerId, alive: c.alive, stats: { ...c.stats }, look: c.look, cos: c.cos })),
      };
    }
    this.finished = true;
    this.scene.stop('UI');
    if (this.autotest) {
      this.scene.restart({ mode: m.mode, mapId: m.mapId, role: this.data_.role });
      return;
    }
    m.destroy();
    this.scene.start('Results', data);
  }

  private paronSummary(p: { mg: string; res: { id: number; place: number; label: string; won: boolean }[] } | null, myId: number): ResultsData['paron'] {
    const r = p?.res.find((x) => x.id === myId);
    return p && r ? { mg: p.mg, place: r.place, label: r.label, won: r.won } : null;
  }

  private launchMinigame(): void {
    const m = this.model;
    const host: MgHost = {
      myId: m.playerId,
      net: () => m.paron(),
      t: () => m.paronT(),
      input: (k) => m.mgInput(k),
      bet: (c, a) => m.rouletteBet(c, a),
      balance: () => account.lonchas,
      react: (e) => m.react(e),
      reactions: () => m.drainReactions(),
      info: (id) => {
        const c = m.chars.find((x) => x.id === id);
        return c ? { name: c.name, look: c.look, team: c.team, cos: c.cos } : undefined;
      },
      onEnd: () => undefined,
    };
    this.scene.launch('Minigame', { host });
    this.scene.bringToTop('Minigame');
    this.scene.bringToTop('Toast');
  }

  private openPause(): void {
    audio.play('click');
    input.consume();
    // Online la partida no se puede parar: la pausa es solo un menú encima.
    if (!this.model.online) {
      this.scene.pause();
      this.scene.pause('UI');
      if (this.scene.isActive('Minigame')) this.scene.pause('Minigame');
    }
    this.scene.launch('Pause', { online: this.model.online });
    this.scene.bringToTop('Pause');
  }

  restartMatch(): void {
    if (this.model.online) return;
    this.scene.stop('UI');
    this.scene.restart({ mode: this.model.mode, mapId: this.model.mapId, role: this.data_.role });
  }
}
