import { DurableObject } from 'cloudflare:workers';
import { BALANCE, NET, PHRASES } from '../../shared/balance';
import { defaultHunters, validMode } from '../../shared/modes/rules';
import { botName, randomLook, sanitizeLook } from '../../shared/look';
import { getMap, mapAllowed, MAPS } from '../../shared/maps';
import { scaleFor } from '../../shared/mapScale';
import {
  ClientMsg,
  compactEvent,
  encodeChar,
  LobbyPlayer,
  MeNet,
  PICKUPS,
  RoomPhase,
  RoomSettings,
  RosterNet,
  ServerMsg,
  SnapshotNet,
  STATES,
} from '../../shared/protocol';
import { Sim } from '../../shared/sim/Sim';
import { MgBag, MgId, MgKey, Paron } from '../../shared/minigames';
import { secureRandom } from '../../shared/minigames/rng';
import { MG, PARON } from '../../shared/balance';
import type { HeldInput, ModeId, Team } from '../../shared/sim/types';
import type { Look } from '../../shared/look';
import { profileOf, validAccount } from './accounts';
import type { Env } from './index';
import type { Equipped, PlayReport } from '../../shared/economy';

interface Player {
  id: number;
  pid: string;
  name: string;
  look: Look;
  ready: boolean;
  ws: WebSocket | null;
  connected: boolean;
  /** Cuándo se desconectó (para la reconexión). */
  leftAt: number;
  held: HeldInput;
  aCount: number;
  bCount: number;
  oCount: number;
  qCount: number;
  vote: ModeId | null;
  /** Cuenta (perfil con lonchas) y cosméticos que lleva. */
  acct: string;
  cos: Equipped;
  streak: number;
  /** Ping que dice tener (para compensar en los minijuegos; con tope). */
  ping: number;
  reactAt: number;
  /** Control de ritmo de mensajes de entrada. */
  winStart: number;
  winCount: number;
}

const TICK_MS = 1000 / NET.tickRate;
const SUBSTEPS = Math.round(60 / NET.tickRate);
const REVEAL_MS = 5200;
const RESULTS_DELAY_MS = 2800;

/** Una sala: lobby + partida autoritativa. Un Durable Object por código. */
export class Room extends DurableObject<Env> {
  private code = '';
  private players: Player[] = [];
  private nextId = 1;
  private hostId = -1;
  private phase: RoomPhase = 'lobby';
  private settings: RoomSettings = { mode: 'voto', hunters: 0, mapId: 'forest', paron: 'normal', duration: 120, botFill: 8, difficulty: 'normal', isPublic: false };
  /** Minijuego del Parón en marcha (la partida está congelada). */
  private paron: Paron | null = null;
  private paronTickAt = 0;
  private paronPhase = '';
  private rouletteHistory: string[] = [];
  /** Bolsa barajada de minijuegos (se acuerda entre partidas de esta sala). */
  private bag = new MgBag(secureRandom);
  private usedThisMatch = new Set<MgId>();
  private balances = new Map<number, number>();
  private settled = false;
  private sim: Sim | null = null;
  private roster: RosterNet[] = [];
  private timer: ReturnType<typeof setTimeout> | null = null;
  private loopStart = 0;
  private loopTicks = 0;
  private tick = 0;
  private revealUntil = 0;
  private endedAt = 0;

  async fetch(req: Request): Promise<Response> {
    const url = new URL(req.url);
    if (req.headers.get('Upgrade') !== 'websocket') return new Response('Se esperaba un WebSocket', { status: 426 });
    const code = url.searchParams.get('code') ?? '';
    if (!this.code) this.code = code;
    // La primera persona que entra desde "partida rápida" hace pública la sala.
    if (url.searchParams.get('pub') === '1' && this.players.length === 0) this.settings.isPublic = true;

    const pair = new WebSocketPair();
    const [client, server] = Object.values(pair);
    server.accept();
    let player: Player | null = null;
    server.addEventListener('message', (ev) => {
      let msg: ClientMsg;
      try {
        msg = JSON.parse(typeof ev.data === 'string' ? ev.data : '') as ClientMsg;
      } catch {
        return;
      }
      if (!player) {
        if (msg.t === 'hello') player = this.join(server, msg.pid, msg.look, msg.acct);
        return;
      }
      this.onMessage(player, msg);
    });
    const close = () => {
      if (player && player.ws === server) this.disconnect(player);
    };
    server.addEventListener('close', close);
    server.addEventListener('error', close);
    return new Response(null, { status: 101, webSocket: client });
  }

  // ------------------------------------------------------------------ jugadores

  private join(ws: WebSocket, pid: string, rawLook: unknown, acct?: string): Player | null {
    pid = String(pid ?? '').slice(0, 64);
    let p = this.players.find((x) => x.pid === pid) ?? null;
    if (p) {
      // Reconexión: recupera su sitio (y su personaje si hay partida).
      if (p.ws && p.ws !== ws) {
        try {
          p.ws.close(4000, 'Conectado desde otra pestaña');
        } catch {
          /* ya cerrado */
        }
      }
      p.ws = ws;
      p.connected = true;
      p.leftAt = 0;
      if (this.sim && this.sim.byId.has(p.id)) this.sim.setHuman(p.id, true);
    } else {
      const reserved = this.players.length;
      if (reserved >= NET.maxPlayers) {
        this.send(ws, { t: 'full' });
        ws.close(4001, 'Sala llena');
        return null;
      }
      const look = sanitizeLook(rawLook, `JUGADOR ${this.nextId}`);
      p = {
        id: this.nextId++,
        pid,
        name: look.name,
        look,
        ready: false,
        ws,
        connected: true,
        leftAt: 0,
        held: { mx: 0, my: 0, sprint: false },
        aCount: 0,
        bCount: 0,
        oCount: 0,
        qCount: 0,
        vote: null,
        acct: validAccount(acct) ? acct : '',
        ping: 80,
        reactAt: 0,
        cos: {},
        streak: 0,
        winStart: 0,
        winCount: 0,
      };
      this.players.push(p);
    }
    if (this.hostId < 0 || !this.players.some((x) => x.id === this.hostId && x.connected)) this.hostId = p.id;
    void this.loadCosmetics(p);
    this.send(ws, { t: 'welcome', you: p.id, code: this.code });
    // Si hay partida en marcha y este jugador está en ella, vuelve a recibirla.
    if (this.sim && (this.phase === 'playing' || this.phase === 'reveal') && this.sim.byId.has(p.id)) this.sendStart(p);
    this.broadcastLobby();
    void this.report();
    return p;
  }

  private disconnect(p: Player): void {
    p.ws = null;
    p.connected = false;
    p.leftAt = Date.now();
    if (this.sim && this.sim.byId.has(p.id)) this.sim.setHuman(p.id, false); // un bot le cubre mientras tanto
    if (this.hostId === p.id) this.pickHost();
    this.broadcastLobby();
    void this.report();
    setTimeout(() => this.cleanup(), NET.reconnectSeconds * 1000 + 200);
  }

  /** Quita a quien lleva más de 15 s desconectado. */
  private cleanup(): void {
    const now = Date.now();
    const before = this.players.length;
    this.players = this.players.filter((p) => p.connected || now - p.leftAt < NET.reconnectSeconds * 1000);
    if (this.players.length !== before) {
      if (!this.players.some((p) => p.id === this.hostId)) this.pickHost();
      this.broadcastLobby();
      void this.report();
    }
    if (!this.players.some((p) => p.connected)) this.stopLoop(true);
  }

  private pickHost(): void {
    const next = this.players.find((p) => p.connected);
    this.hostId = next ? next.id : -1;
  }

  // ------------------------------------------------------------------ mensajes

  private onMessage(p: Player, msg: ClientMsg): void {
    switch (msg.t) {
      case 'in': {
        // Máximo ~20 mensajes por segundo y jugador.
        const now = Date.now();
        if (now - p.winStart > 1000) {
          p.winStart = now;
          p.winCount = 0;
        }
        if (++p.winCount > 25) return;
        const clamp = (v: unknown) => Math.max(-100, Math.min(100, Math.round(Number(v) || 0))) / 100;
        p.held = { mx: clamp(msg.x), my: clamp(msg.y), sprint: msg.r === 1 };
        this.sim?.setHeld(p.id, p.held);
        const a = Math.floor(Number(msg.a) || 0);
        const b = Math.floor(Number(msg.b) || 0);
        const o = Math.floor(Number(msg.o) || 0);
        const q = Math.floor(Number(msg.q) || 0);
        if (a > p.aCount) this.sim?.press(p.id, 'action');
        if (b > p.bCount) this.sim?.press(p.id, 'special');
        if (o > p.oCount) this.sim?.press(p.id, 'rotate');
        if (q > p.qCount) this.sim?.press(p.id, 'spin');
        p.aCount = Math.max(p.aCount, a);
        p.bCount = Math.max(p.bCount, b);
        p.oCount = Math.max(p.oCount, o);
        p.qCount = Math.max(p.qCount, q);
        break;
      }
      case 'say': {
        const sim = this.sim;
        const c = sim?.byId.get(p.id);
        if (!sim || !c) break;
        const mw = sim.mode === 'pilla' ? null : PHRASES.modeWheel[sim.mode];
        const wheel = (mw ? mw[c.team] : PHRASES.wheel[c.team]) as readonly number[];
        if (wheel.includes(msg.p)) sim.say(p.id, msg.p);
        break;
      }
      case 'emo':
        this.sim?.emote(p.id);
        break;
      case 'mi': {
        // Tecla en el minijuego: se compensa media latencia (como mucho 150 ms).
        const pr = this.paron;
        if (!pr || !['a', 'b', 'l', 'r'].includes(msg.k)) break;
        const now = Date.now();
        if (now - p.winStart > 1000) {
          p.winStart = now;
          p.winCount = 0;
        }
        if (++p.winCount > 40) break;
        if (typeof msg.p === 'number' && Number.isFinite(msg.p)) p.ping = Math.max(0, Math.min(400, msg.p));
        const ahead = Math.min(0.05, (now - this.paronTickAt) / 1000);
        pr.input(p.id, msg.k as MgKey, Math.min(0.15, p.ping / 2000) - ahead);
        break;
      }
      case 'rb':
        // Apuesta del Evento Ruleta: color y cantidad (el servidor la limita a tu saldo).
        this.paron?.ruleta?.bet(p.id, msg.c, msg.a);
        break;
      case 're': {
        // Reacciones (🔥😂😱👏🍖) durante el Parón: llegan a todos.
        const now = Date.now();
        const e = Math.floor(Number(msg.e));
        if (!this.paron || !(e >= 0 && e < 5) || now - p.reactAt < 1000 / PARON.reactionsPerSec) break;
        p.reactAt = now;
        for (const o of this.players) if (o.ws) this.send(o.ws, { t: 're', id: p.id, e });
        break;
      }
      case 'vote':
        if (this.phase === 'lobby' && validMode(msg.m)) {
          p.vote = msg.m;
          this.broadcastLobby();
        }
        break;
      case 'ping':
        if (p.ws) this.send(p.ws, { t: 'pong', c: Number(msg.c) || 0, ts: Date.now() });
        break;
      case 'look':
        p.look = sanitizeLook(msg.look, p.name);
        p.name = p.look.name;
        this.broadcastLobby();
        break;
      case 'ready':
        if (this.phase === 'lobby') {
          p.ready = !!msg.v;
          this.broadcastLobby();
        }
        break;
      case 'settings':
        if (p.id === this.hostId && this.phase === 'lobby') {
          this.applySettings(msg.s);
          this.broadcastLobby();
          void this.report();
        }
        break;
      case 'start':
        if (p.id === this.hostId && this.phase === 'lobby') this.startMatch();
        break;
      case 'leave':
        p.leftAt = 0;
        this.players = this.players.filter((x) => x !== p);
        if (this.sim && this.sim.byId.has(p.id)) this.sim.setHuman(p.id, false);
        if (this.hostId === p.id) this.pickHost();
        try {
          p.ws?.close(1000, 'Adiós');
        } catch {
          /* ya cerrado */
        }
        p.ws = null;
        this.broadcastLobby();
        void this.report();
        // Si ya no queda nadie, la partida de los bots se para.
        if (!this.players.some((x) => x.connected)) this.stopLoop(true);
        break;
      case 'hello':
        break;
    }
  }

  private applySettings(s: Partial<RoomSettings>): void {
    if (s.mode === 'voto' || validMode(s.mode)) this.settings.mode = s.mode;
    if (typeof s.hunters === 'number' && (NET.huntersOptions as readonly number[]).includes(s.hunters)) this.settings.hunters = s.hunters;
    if (s.mapId && MAPS.some((m) => m.id === s.mapId)) this.settings.mapId = s.mapId;
    if (typeof s.paron === 'string' && s.paron in PARON.levels) this.settings.paron = s.paron;
    if (typeof s.duration === 'number' && (NET.durationOptions as readonly number[]).includes(s.duration)) this.settings.duration = s.duration;
    if (typeof s.botFill === 'number' && (NET.botFillOptions as readonly number[]).includes(s.botFill)) this.settings.botFill = s.botFill;
    if (s.difficulty && s.difficulty in BALANCE.ai) this.settings.difficulty = s.difficulty;
    if (typeof s.isPublic === 'boolean') this.settings.isPublic = s.isPublic;
  }

  // ------------------------------------------------------------------ partida

  private startMatch(): void {
    const humans = this.players.filter((p) => p.connected);
    const others = humans.filter((p) => p.id !== this.hostId);
    if (others.some((p) => !p.ready)) {
      this.sendTo(this.hostId, { t: 'error', msg: 'FALTA GENTE POR ESTAR LISTA' });
      return;
    }
    const total = Math.min(NET.maxPlayers, Math.max(humans.length, this.settings.botFill));
    if (total < 2) {
      this.sendTo(this.hostId, { t: 'error', msg: 'HACEN FALTA 2 JUGADORES O BOTS' });
      return;
    }
    const mode = this.resolveMode(humans);
    // Equipos al azar: cuántos cazadores depende del modo (o lo fija el anfitrión).
    const auto = defaultHunters(mode, total);
    const nChasers = mode === 'bomba' ? 0 : this.settings.hunters > 0 ? Math.min(total - 1, this.settings.hunters) : auto;
    const slots: { human: Player | null }[] = [...humans.map((h) => ({ human: h as Player | null }))];
    while (slots.length < total) slots.push({ human: null });
    for (let i = slots.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [slots[i], slots[j]] = [slots[j], slots[i]];
    }
    let botId = 1000;
    let bi = Math.floor(Math.random() * 20);
    this.roster = slots.map((s, i) => {
      const team: Team = i < nChasers ? 'chaser' : 'escapist';
      if (s.human)
        return {
          id: s.human.id,
          name: s.human.name,
          team,
          look: s.human.look,
          human: true,
          cos: s.human.cos,
          streak: s.human.streak,
        };
      const name = botName(bi++);
      return { id: botId++, name: `${name}`, team, look: randomLook(name), human: false };
    });
    // La casa es solo para el Escondite: con otro modo (p. ej. tras una votación) se juega en el bosque.
    const mapId = mapAllowed(getMap(this.settings.mapId), mode) ? this.settings.mapId : 'forest';
    const scale = scaleFor(total, mapId);
    this.sim = new Sim({ mode, mapId, scale, duration: this.settings.duration, difficulty: this.settings.difficulty, roster: this.roster, paron: this.settings.paron });
    this.paron = null;
    this.usedThisMatch = new Set();
    // El modo puede cambiar los equipos (Jamón Bomba: todos contra todos).
    for (const r of this.roster) r.team = this.sim.byId.get(r.id)?.team ?? r.team;
    for (const p of humans) this.sim.setHeld(p.id, { mx: 0, my: 0, sprint: false });
    this.phase = 'reveal';
    this.revealUntil = Date.now() + REVEAL_MS;
    this.endedAt = 0;
    this.tick = 0;
    for (const p of humans) this.sendStart(p);
    this.broadcastLobby();
    void this.report();
    this.startLoop();
  }

  /** Modo de la partida: el del anfitrión o el más votado (empate: al azar). */
  private resolveMode(humans: Player[]): ModeId {
    if (this.settings.mode !== 'voto') return this.settings.mode;
    const count = new Map<ModeId, number>();
    for (const h of humans) if (h.vote) count.set(h.vote, (count.get(h.vote) ?? 0) + 1);
    if (!count.size) return 'pilla';
    const max = Math.max(...count.values());
    const top = [...count.entries()].filter(([, n]) => n === max).map(([m]) => m);
    return top[Math.floor(Math.random() * top.length)];
  }

  private sendStart(p: Player): void {
    if (!this.sim || !p.ws) return;
    this.send(p.ws, {
      t: 'start',
      mode: this.sim.mode,
      seed: this.sim.seed,
      mapId: this.sim.mapId,
      scale: this.sim.scale,
      duration: this.sim.duration,
      difficulty: this.settings.difficulty,
      roster: this.roster,
      you: p.id,
      revealMs: Math.max(0, this.revealUntil - Date.now()),
    });
  }

  /** Bucle a 20 Hz que compensa los retrasos del temporizador (setInterval se va atrasando). */
  private startLoop(): void {
    if (this.timer) return;
    this.loopStart = Date.now();
    this.loopTicks = 0;
    const next = () => {
      this.loopTicks++;
      const due = this.loopStart + this.loopTicks * TICK_MS;
      this.timer = setTimeout(() => {
        if (!this.timer) return;
        this.onTick();
        if (this.timer) next();
      }, Math.max(0, due - Date.now()));
    };
    next();
  }

  private stopLoop(resetToLobby: boolean): void {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    if (resetToLobby && this.phase !== 'lobby') {
      this.phase = 'lobby';
      this.sim = null;
    }
  }

  private onTick(): void {
    const sim = this.sim;
    if (!sim) return this.stopLoop(true);
    const now = Date.now();
    if (this.phase === 'reveal') {
      if (now < this.revealUntil) return;
      this.phase = 'playing';
    }
    if (this.phase !== 'playing') return;
    // ¡Parón! La partida no avanza: solo el minijuego.
    if (sim.frozen) {
      this.tickParon(sim, now);
      // Snapshots más espaciados (nada se mueve), para que todo siga sincronizado.
      if (this.tick++ % 4 === 0) this.broadcastSnapshot(sim, sim.drain().map(compactEvent), now);
      return;
    }
    for (let i = 0; i < SUBSTEPS; i++) sim.step(1 / 60);
    const events = sim.drain().map(compactEvent);
    this.tick++;
    this.broadcastSnapshot(sim, events, now);
    if (sim.state === 'ended') {
      if (!this.endedAt) this.endedAt = now;
      else if (now - this.endedAt > RESULTS_DELAY_MS) this.finishMatch(sim);
    }
  }

  private tickParon(sim: Sim, now: number): void {
    if (!this.paron) {
      const players = sim.chars.map((c) => ({ id: c.id, name: c.name, team: c.team, bot: !this.players.some((p) => p.id === c.id && p.connected) }));
      const slot = sim.current ?? { kind: 'mini' as const, double: false, at: 0 };
      const queue = slot.kind === 'mini' ? this.bag.draw(slot.double ? 2 : 1, this.usedThisMatch) : undefined;
      this.balances = new Map();
      this.settled = false;
      if (slot.kind === 'ruleta') void this.loadBalances(sim);
      this.paron = new Paron(players, secureRandom, {
        kind: slot.kind,
        queue,
        extra: { rouletteHistory: this.rouletteHistory },
        // Los bots apuestan "de mentira"; las personas, con sus lonchas de verdad.
        balance: (id) => (players.find((p) => p.id === id)?.bot ? 200 : (this.balances.get(id) ?? 0)),
      });
      this.paronPhase = '';
    }
    const pr = this.paron;
    // Quien se desconecta pasa a jugar como bot.
    for (const pl of pr.players) pl.bot = !this.players.some((p) => p.id === pl.id && p.connected);
    pr.tick(TICK_MS / 1000);
    this.paronTickAt = now;
    // Estado del minijuego a 10 Hz (y siempre que cambia de fase).
    const phaseChanged = pr.phase !== this.paronPhase;
    this.paronPhase = pr.phase;
    if (phaseChanged || this.tick % 2 === 0) {
      const raw = JSON.stringify({ t: 'mg', p: pr.net() });
      for (const p of this.players) if (p.ws) this.sendRaw(p.ws, raw);
    }
    // Evento Ruleta: se cobra/paga justo cuando se ve el resultado.
    if (pr.kind === 'ruleta' && !this.settled && pr.ruleta && pr.ruleta.pocket && pr.ruleta.t >= pr.ruleta.spinStart + MG.ruleta.spin) {
      this.settled = true;
      void this.settleRoulette(pr);
    }
    if (pr.done) {
      void this.payParon(pr);
      sim.resume(pr.chosenPerks());
      this.paron = null;
    }
  }

  private async loadBalances(sim: Sim): Promise<void> {
    for (const p of this.players) {
      if (!p.acct || !p.connected || !sim.byId.has(p.id)) continue;
      try {
        this.balances.set(p.id, await profileOf(this.env, p.acct).balance(p.acct));
      } catch {
        /* sin saldo: no puede apostar */
      }
    }
  }

  private async settleRoulette(pr: Paron): Promise<void> {
    const ru = pr.ruleta;
    if (!ru) return;
    for (const p of this.players) {
      const b = ru.betOf(p.id);
      if (!p.acct || !b.c || b.a <= 0) continue;
      try {
        const res = await profileOf(this.env, p.acct).roulette(p.acct, b.c, b.a, ru.pocket);
        if (p.ws) this.send(p.ws, { t: 'reward', res: { lonchas: res.delta, xp: 0, notices: res.notices } });
      } catch {
        /* no es crítico */
      }
    }
  }

  /** Lonchas por los minijuegos y la carrera (las calcula el servidor). */
  private async payParon(pr: Paron): Promise<void> {
    if (pr.kind === 'ruleta') return;
    for (const round of pr.rounds) {
      for (const r of round.results) {
        const p = this.players.find((x) => x.id === r.id);
        if (!p || !p.acct || !p.connected) continue;
        if (pr.kind === 'carrera' && r.bonus <= 0) continue;
        try {
          const report: PlayReport =
            pr.kind === 'carrera'
              ? { kind: 'event', won: r.won, coins: r.bonus }
              : { kind: 'minigame', mg: round.mg, won: r.won, place: r.place, coins: r.bonus, stats: { perfects: r.perfects ?? 0 } };
          const res = await profileOf(this.env, p.acct).report(p.acct, report, true);
          p.streak = res.profile.mgStreak;
          if (p.ws) this.send(p.ws, { t: 'reward', res: { lonchas: res.lonchas, xp: res.xp, notices: res.notices } });
        } catch {
          /* no es crítico */
        }
      }
    }
  }

  private broadcastSnapshot(sim: Sim, events: ReturnType<typeof compactEvent>[], now: number): void {
    const snap: SnapshotNet = {
      n: this.tick,
      ts: now,
      st: STATES.indexOf(sim.state),
      tl: Math.round(sim.timeLeft * 10),
      mt: Math.round(sim.matchTime * 10),
      c: sim.chars.map(encodeChar),
      p: sim.pickups.map((p) => [p.iid, PICKUPS.indexOf(p.type), Math.round(p.x), Math.round(p.y), Math.round(p.life)]),
      j: sim.projectiles.map((p) => [p.pid, Math.round(p.x), Math.round(p.y), Math.round(p.dx * 100), Math.round(p.dy * 100), Math.round(p.travelled)]),
      k: sim.smokes.map((s) => [s.sid, Math.round(s.x), Math.round(s.y), Math.round(s.life * 10)]),
      w: [Math.round(sim.wind.x * 10), Math.round(sim.wind.y * 10)],
      ms: sim.modeNet(),
      e: events,
    };
    const common = JSON.stringify(snap);
    for (const p of this.players) {
      if (!p.ws) continue;
      const c = sim.byId.get(p.id);
      let me = '';
      if (c) {
        const m: MeNet = {
          ac: Math.round(Math.max(0, c.attackCd) * 100) / 100,
          dc: Math.round(Math.max(0, c.dashCd) * 100) / 100,
          sc: Math.round(Math.max(0, c.specialCd) * 100) / 100,
          st: Math.round(c.straightTime * 100) / 100,
          ex: Math.round(Math.max(0, c.exhaustTimer) * 100) / 100,
          en: Math.round(c.energy),
          bt: Math.round(Math.max(0, c.bootTime) * 10) / 10,
          el: c.stats.eliminations,
          sp: c.spinsLeft,
        };
        me = `,"m":${JSON.stringify(m)}`;
      }
      this.sendRaw(p.ws, `{"t":"s","s":${common}${me}}`);
    }
  }

  private finishMatch(sim: Sim): void {
    const msg: ServerMsg = {
      t: 'results',
      mode: sim.mode,
      winner: sim.winner ?? 'escapist',
      champion: sim.champion,
      timePlayed: sim.matchTime,
      duration: sim.duration,
      mapId: sim.mapId,
      entries: sim.chars.map((c) => ({ id: c.id, name: c.name, team: c.team, alive: c.alive, human: !!this.roster.find((r) => r.id === c.id)?.human, look: c.look, stats: c.stats })),
    };
    for (const p of this.players) if (p.ws) this.send(p.ws, msg);
    void this.recordRank(sim);
    void this.payRewards(sim);
    this.stopLoop(false);
    this.sim = null;
    this.phase = 'lobby';
    for (const p of this.players) p.ready = false;
    this.broadcastLobby();
    void this.report();
  }

  // ------------------------------------------------------------------ envío

  private lobbyPlayers(): LobbyPlayer[] {
    return this.players.map((p) => ({ id: p.id, name: p.name, look: p.look, ready: p.ready, host: p.id === this.hostId, connected: p.connected, vote: p.vote, cos: p.cos, streak: p.streak }));
  }

  private broadcastLobby(): void {
    const players = this.lobbyPlayers();
    for (const p of this.players) {
      if (!p.ws) continue;
      this.send(p.ws, { t: 'lobby', code: this.code, phase: this.phase, players, settings: this.settings, you: p.id });
    }
  }

  private sendTo(id: number, msg: ServerMsg): void {
    const p = this.players.find((x) => x.id === id);
    if (p?.ws) this.send(p.ws, msg);
  }

  private send(ws: WebSocket, msg: ServerMsg): void {
    this.sendRaw(ws, JSON.stringify(msg));
  }

  private sendRaw(ws: WebSocket, data: string): void {
    try {
      ws.send(data);
    } catch {
      /* conexión cerrada */
    }
  }

  /** Cosméticos de verdad (los que tiene en su perfil), no lo que diga el navegador. */
  private async loadCosmetics(p: Player): Promise<void> {
    if (!p.acct) return;
    try {
      const r = await profileOf(this.env, p.acct).equipped(p.acct);
      p.cos = r.eq;
      p.streak = r.streak;
      this.broadcastLobby();
    } catch {
      /* sin perfil: sin cosméticos */
    }
  }

  /** Lonchas, experiencia y misiones de cada persona: lo calcula el servidor. */
  private async payRewards(sim: Sim): Promise<void> {
    for (const p of this.players) {
      const c = sim.byId.get(p.id);
      if (!c || !p.acct || !p.connected) continue;
      const won = sim.mode === 'bomba' ? sim.champion === c.id : c.team === sim.winner;
      const s = c.stats;
      const report: PlayReport = {
        kind: 'match',
        mode: sim.mode,
        won,
        coins: s.coins,
        medals: s.medals,
        stats: { passes: s.passes, survive: Math.floor(s.timeSurvived), infections: s.infections, finds: s.finds, rescues: s.rescues, hits: s.hits },
      };
      try {
        const res = await profileOf(this.env, p.acct).report(p.acct, report, true);
        p.streak = res.profile.mgStreak;
        if (p.ws) this.send(p.ws, { t: 'reward', res: { lonchas: res.lonchas, xp: res.xp, notices: res.notices } });
      } catch {
        /* no es crítico */
      }
    }
  }

  /** Ranking mundial: solo cuentan las personas (no los bots). */
  private async recordRank(sim: Sim): Promise<void> {
    // Solo cuentan las personas que siguen en la sala al acabar.
    const humans = sim.chars.filter((c) => this.players.some((p) => p.id === c.id && p.connected));
    if (!humans.length) return;
    try {
      const mm = this.env.MATCHMAKER.get(this.env.MATCHMAKER.idFromName('global'));
      await mm.record(sim.mode, humans.map((c) => ({ name: c.name, coins: c.stats.coins })));
    } catch {
      /* no es crítico */
    }
  }

  /** Avisa al buscador de partidas de cómo está la sala. */
  private async report(): Promise<void> {
    if (!this.code) return;
    try {
      const mm = this.env.MATCHMAKER.get(this.env.MATCHMAKER.idFromName('global'));
      await mm.update({
        code: this.code,
        players: this.players.filter((p) => p.connected).length,
        phase: this.phase,
        isPublic: this.settings.isPublic,
      });
    } catch {
      /* no es crítico */
    }
  }
}
