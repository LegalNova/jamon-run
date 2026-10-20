import { DurableObject } from 'cloudflare:workers';
import { NET } from '../../shared/balance';
import type { RoomPhase } from '../../shared/protocol';
import { randomCode } from '../../shared/protocol';
import type { Env } from './index';

interface RoomInfo {
  code: string;
  players: number;
  phase: RoomPhase;
  isPublic: boolean;
  updated: number;
}

/** Lleva la cuenta de las salas para la partida rápida y para no repetir códigos. */
export class Matchmaker extends DurableObject<Env> {
  private rooms = new Map<string, RoomInfo>();

  update(info: Omit<RoomInfo, 'updated'>): void {
    if (info.players <= 0) {
      this.rooms.delete(info.code);
      return;
    }
    this.rooms.set(info.code, { ...info, updated: Date.now() });
  }

  /** Una sala pública con sitio (la más llena primero) o una nueva. */
  quick(): string {
    this.prune();
    let best: RoomInfo | null = null;
    for (const r of this.rooms.values()) {
      if (!r.isPublic || r.phase !== 'lobby' || r.players >= NET.maxPlayers) continue;
      if (!best || r.players > best.players) best = r;
    }
    if (best) return best.code;
    const code = this.newCode();
    // Reservada como pública hasta que entre alguien.
    this.rooms.set(code, { code, players: 0, phase: 'lobby', isPublic: true, updated: Date.now() });
    return code;
  }

  newCode(): string {
    this.prune();
    let code = randomCode(NET.roomCodeLength);
    while (this.rooms.has(code)) code = randomCode(NET.roomCodeLength);
    return code;
  }

  stats(): { rooms: number; players: number } {
    this.prune();
    let players = 0;
    for (const r of this.rooms.values()) players += r.players;
    return { rooms: this.rooms.size, players };
  }

  private prune(): void {
    const now = Date.now();
    for (const [code, r] of this.rooms) {
      // Las salas avisan en cada cambio; si llevan mucho sin decir nada, se olvidan.
      if (now - r.updated > 10 * 60_000 || (r.players === 0 && now - r.updated > 30_000)) this.rooms.delete(code);
    }
  }
}
