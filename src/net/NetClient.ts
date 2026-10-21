import { NET } from '../../shared/balance';
import type { Look } from '../../shared/look';
import type { ClientMsg, LobbyPlayer, RoomPhase, RoomSettings, ServerMsg } from '../../shared/protocol';
import { playerId, profile } from '../config/profile';
import { account } from './account';

export type NetStatus = 'idle' | 'connecting' | 'open' | 'reconnecting' | 'closed' | 'full';

export interface LobbyState {
  code: string;
  phase: RoomPhase;
  players: LobbyPlayer[];
  settings: RoomSettings;
  you: number;
}

type Listener = (msg: ServerMsg) => void;

/** Solo para pruebas: ?lag=120 simula 120 ms de ping (60 ms de ida y 60 de vuelta). */
const FAKE_LAG = Math.max(0, Math.min(1000, Number(new URLSearchParams(location.search).get('lag')) || 0));
const delayed = (fn: () => void) => (FAKE_LAG ? setTimeout(fn, FAKE_LAG / 2) : fn());

/** Identificador por pestaña: así se pueden abrir varias pestañas en la misma sala para probar. */
function tabPid(): string {
  let tab = '';
  try {
    tab = sessionStorage.getItem('jamonrun.tab') ?? '';
    if (!tab) {
      tab = Math.random().toString(36).slice(2, 8);
      sessionStorage.setItem('jamonrun.tab', tab);
    }
  } catch {
    tab = Math.random().toString(36).slice(2, 8);
  }
  return `${playerId()}-${tab}`;
}

/**
 * Conexión con una sala (WebSocket). Se reconecta sola durante 15 s si se corta.
 * También mide el ping y estima la hora del servidor.
 */
class NetClient {
  status: NetStatus = 'idle';
  code = '';
  you = -1;
  lobby: LobbyState | null = null;
  ping = 0;
  private pendingStart: { msg: Extract<ServerMsg, { t: 'start' }>; at: number } | null = null;
  private ws: WebSocket | null = null;
  private listeners = new Set<Listener>();
  private wantOpen = false;
  private pub = false;
  private dropAt = 0;
  private pingTimer: ReturnType<typeof setInterval> | null = null;
  private retryTimer: ReturnType<typeof setTimeout> | null = null;
  /** hora del servidor - hora local (ms) */
  private offset = 0;
  private lastMsgAt = 0;
  private bestRtt = Infinity;
  private haveOffset = false;

  get connected(): boolean {
    return this.status === 'open';
  }

  /** Hora estimada del servidor (ms). */
  serverNow(): number {
    return performance.now() + this.offset;
  }

  /** Corrige el reloj con la hora de un snapshot si aún no hay ping. */
  hintServerTime(ts: number): void {
    if (!this.haveOffset) {
      this.offset = ts - performance.now() - 40;
      this.haveOffset = true;
    }
  }

  on(fn: Listener): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  async quickCode(): Promise<string> {
    const r = await fetch('/api/quick');
    if (!r.ok) throw new Error('No se pudo buscar partida');
    return ((await r.json()) as { code: string }).code;
  }

  async newCode(): Promise<string> {
    const r = await fetch('/api/new');
    if (!r.ok) throw new Error('No se pudo crear la sala');
    return ((await r.json()) as { code: string }).code;
  }

  connect(code: string, isPublic = false): void {
    this.leave(false);
    this.code = code.toUpperCase();
    this.pub = isPublic;
    this.wantOpen = true;
    this.dropAt = 0;
    this.lobby = null;
    this.you = -1;
    this.open();
  }

  private open(): void {
    this.status = this.dropAt ? 'reconnecting' : 'connecting';
    const proto = location.protocol === 'https:' ? 'wss:' : 'ws:';
    const ws = new WebSocket(`${proto}//${location.host}/ws/${this.code}${this.pub ? '?pub=1' : ''}`);
    this.ws = ws;
    // Si no conecta en 5 s, lo damos por fallido (y se reintenta).
    setTimeout(() => {
      if (this.ws === ws && ws.readyState !== WebSocket.OPEN) this.dropped(ws, 1006);
    }, 5000);
    ws.onopen = () => {
      if (this.ws !== ws) return;
      this.status = 'open';
      this.dropAt = 0;
      this.lastMsgAt = performance.now();
      this.sendMsg({ t: 'hello', pid: tabPid(), look: profile.look, acct: playerId() });
      this.sendPing();
      if (this.pingTimer) clearInterval(this.pingTimer);
      this.pingTimer = setInterval(() => {
        // Conexión muerta sin aviso (wifi caída, etc.): no llega nada desde hace rato.
        if (performance.now() - this.lastMsgAt > 4000) {
          this.dropped(ws, 1006);
          return;
        }
        this.sendPing();
      }, 1000);
    };
    ws.onmessage = (ev) => {
      if (this.ws !== ws) return;
      let msg: ServerMsg;
      try {
        msg = JSON.parse(ev.data as string) as ServerMsg;
      } catch {
        return;
      }
      this.lastMsgAt = performance.now();
      delayed(() => {
        if (this.ws === ws) this.handle(msg);
      });
    };
    ws.onclose = (ev) => this.dropped(ws, ev.code);
  }

  /** La conexión se ha cerrado o se ha muerto: reintenta durante 15 s. */
  private dropped(ws: WebSocket, code: number): void {
    if (this.ws !== ws) return;
    this.ws = null;
    ws.onopen = ws.onmessage = ws.onclose = null;
    try {
      ws.close();
    } catch {
      /* ya cerrado */
    }
    if (this.pingTimer) clearInterval(this.pingTimer);
    if (code === 4001) {
      this.status = 'full';
      this.wantOpen = false;
    } else if (code === 4000) {
      this.wantOpen = false;
    }
    if (!this.wantOpen) {
      if (this.status !== 'full') this.status = 'closed';
      this.emit({ t: 'error', msg: this.status === 'full' ? 'LA SALA ESTÁ LLENA' : 'DESCONECTADO' });
      return;
    }
    if (!this.dropAt) this.dropAt = performance.now();
    if (performance.now() - this.dropAt < NET.reconnectSeconds * 1000) {
      this.status = 'reconnecting';
      this.retryTimer = setTimeout(() => this.open(), 800);
    } else {
      this.status = 'closed';
      this.wantOpen = false;
      this.emit({ t: 'error', msg: 'SE PERDIÓ LA CONEXIÓN' });
    }
  }

  private handle(msg: ServerMsg): void {
    switch (msg.t) {
      case 'welcome':
        this.you = msg.you;
        this.code = msg.code || this.code;
        break;
      case 'start':
        this.pendingStart = { msg, at: performance.now() };
        break;
      case 'reward':
        account.applyReward(msg.res);
        break;
      case 'lobby':
        this.lobby = { code: msg.code, phase: msg.phase, players: msg.players, settings: msg.settings, you: msg.you };
        this.you = msg.you;
        break;
      case 'pong': {
        const now = performance.now();
        const rtt = now - msg.c;
        this.ping = this.ping ? this.ping * 0.8 + rtt * 0.2 : rtt;
        // El ping más rápido da la mejor estimación del reloj del servidor.
        if (rtt <= this.bestRtt * 1.25 || !this.haveOffset) {
          this.bestRtt = Math.min(this.bestRtt, rtt);
          const sample = msg.ts - (msg.c + rtt / 2);
          this.offset = this.haveOffset ? this.offset * 0.7 + sample * 0.3 : sample;
          this.haveOffset = true;
        }
        break;
      }
    }
    this.emit(msg);
  }

  /** Una partida que empezó y que aún no ha recogido ninguna pantalla. */
  takePendingStart(): Extract<ServerMsg, { t: 'start' }> | null {
    const p = this.pendingStart;
    this.pendingStart = null;
    if (!p) return null;
    const age = performance.now() - p.at;
    if (age > p.msg.revealMs + 20_000) return null;
    return { ...p.msg, revealMs: Math.max(0, p.msg.revealMs - age) };
  }

  private emit(msg: ServerMsg): void {
    for (const l of [...this.listeners]) l(msg);
  }

  private sendPing(): void {
    this.sendMsg({ t: 'ping', c: performance.now() });
  }

  sendMsg(msg: ClientMsg): void {
    const ws = this.ws;
    if (!ws || ws.readyState !== WebSocket.OPEN) return;
    const data = JSON.stringify(msg);
    delayed(() => {
      if (ws.readyState === WebSocket.OPEN) ws.send(data);
    });
  }

  setLook(look: Look): void {
    this.sendMsg({ t: 'look', look });
  }

  /** Sale de la sala (avisando al servidor si se puede). */
  leave(notify = true): void {
    this.wantOpen = false;
    if (this.retryTimer) clearTimeout(this.retryTimer);
    if (this.pingTimer) clearInterval(this.pingTimer);
    if (this.ws) {
      if (notify) this.sendMsg({ t: 'leave' });
      try {
        this.ws.close(1000);
      } catch {
        /* nada */
      }
    }
    this.ws = null;
    this.status = 'idle';
    this.lobby = null;
    this.you = -1;
    this.pendingStart = null;
    this.bestRtt = Infinity;
    this.haveOffset = false;
  }
}

export const net = new NetClient();
