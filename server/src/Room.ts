import { DurableObject } from 'cloudflare:workers';
import { BALANCE, HYPE, NET, PHRASES } from '../../shared/balance';
import { defaultHunters, validMode } from '../../shared/modes/rules';
import { botName, randomLook, sanitizeLook } from '../../shared/look';
import { MAPS } from '../../shared/maps';
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
import type { HeldInput, ModeId, Team } from '../../shared/sim/types';
import type { Look } from '../../shared/look';
import type { Env } from './index';

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
  horse: number;
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
  private settings: RoomSettings = { mode: 'voto', hunters: 0, mapId: 'forest', duration: 120, botFill: 8, difficulty: 'normal', isPublic: false };
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
        if (msg.t === 'hello') player = this.join(server, msg.pid, msg.look);
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

  private join(ws: WebSocket, pid: string, rawLook: unknown): Player | null {
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
        horse: -1,
        winStart: 0,
        winCount: 0,
      };
      this.players.push(p);
    }
    if (this.hostId < 0 || !this.players.some((x) => x.id === this.hostId && x.connected)) this.hostId = p.id;
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
      case 'vote':
        if (this.phase === 'lobby' && validMode(msg.m)) {
          p.vote = msg.m;
          this.broadcastLobby();
        }
        break;
      case 'horse':
        if (this.phase === 'lobby' && Number.isInteger(msg.h) && msg.h >= 0 && msg.h < HYPE.horses.length) {
          p.horse = msg.h;
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
        break;
      case 'hello':
        break;
    }
  }

  private applySettings(s: Partial<RoomSettings>): void {
    if (s.mode === 'voto' || validMode(s.mode)) this.settings.mode = s.mode;
    if (typeof s.hunters === 'number' && (NET.huntersOptions as readonly number[]).includes(s.hunters)) this.settings.hunters = s.hunters;
    if (s.mapId && MAPS.some((m) => m.id === s.mapId)) this.settings.mapId = s.mapId;
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
      if (s.human) return { id: s.human.id, name: s.human.name, team, look: s.human.look, human: true, horse: s.human.horse >= 0 ? s.human.horse : Math.floor(Math.random() * HYPE.horses.length) };
      const name = botName(bi++);
      return { id: botId++, name: `${name}`, team, look: randomLook(name), human: false, horse: Math.floor(Math.random() * HYPE.horses.length) };
    });
    const scale = scaleFor(total, this.settings.mapId);
    this.sim = new Sim({ mode, mapId: this.settings.mapId, scale, duration: this.settings.duration, difficulty: this.settings.difficulty, roster: this.roster });
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
    for (let i = 0; i < SUBSTEPS; i++) sim.step(1 / 60);
    const events = sim.drain().map(compactEvent);
    this.tick++;
    this.broadcastSnapshot(sim, events, now);
    if (sim.state === 'ended') {
      if (!this.endedAt) this.endedAt = now;
      else if (now - this.endedAt > RESULTS_DELAY_MS) this.finishMatch(sim);
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
      horse: sim.hype.horseWinner,
      timePlayed: sim.matchTime,
      duration: sim.duration,
      mapId: sim.mapId,
      entries: sim.chars.map((c) => ({ id: c.id, name: c.name, team: c.team, alive: c.alive, human: !!this.roster.find((r) => r.id === c.id)?.human, look: c.look, stats: c.stats })),
    };
    for (const p of this.players) if (p.ws) this.send(p.ws, msg);
    void this.recordRank(sim);
    this.stopLoop(false);
    this.sim = null;
    this.phase = 'lobby';
    for (const p of this.players) p.ready = false;
    this.broadcastLobby();
    void this.report();
  }

  // ------------------------------------------------------------------ envío

  private lobbyPlayers(): LobbyPlayer[] {
    return this.players.map((p) => ({ id: p.id, name: p.name, look: p.look, ready: p.ready, host: p.id === this.hostId, connected: p.connected, vote: p.vote, horse: p.horse }));
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

  /** Ranking mundial: solo cuentan las personas (no los bots). */
  private async recordRank(sim: Sim): Promise<void> {
    const humans = sim.chars.filter((c) => this.roster.find((r) => r.id === c.id)?.human);
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
