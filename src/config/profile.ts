import { Look, randomLook, sanitizeLook } from '../../shared/look';

const LOOK_KEY = 'jamonrun.look.v1';
const ID_KEY = 'jamonrun.playerId.v1';

function load(): Look {
  try {
    const raw = localStorage.getItem(LOOK_KEY);
    if (raw) return sanitizeLook(JSON.parse(raw), 'JUGADOR');
  } catch {
    /* sin almacenamiento */
  }
  return { ...randomLook('JUGADOR'), skin: 1 };
}

/** Aspecto del jugador ("Mi personaje"). */
export const profile: { look: Look } = { look: load() };

export function saveLook(look: Look): void {
  profile.look = sanitizeLook(look, 'JUGADOR');
  try {
    localStorage.setItem(LOOK_KEY, JSON.stringify(profile.look));
  } catch {
    /* sin almacenamiento */
  }
}

/** Identificador estable del jugador (para reconectar a una sala online). */
export function playerId(): string {
  try {
    let id = localStorage.getItem(ID_KEY);
    if (!id) {
      id = (crypto.randomUUID?.() ?? `${Date.now()}-${Math.random()}`).replace(/[^a-zA-Z0-9-]/g, '');
      localStorage.setItem(ID_KEY, id);
    }
    return id;
  } catch {
    return `anon-${Math.random().toString(36).slice(2)}`;
  }
}

// ------------------------------------------------------------------ monedero, nivel y récords

import { levelFor } from '../../shared/balance';
import type { ModeId } from '../../shared/sim/types';

const WALLET_KEY = 'jamonrun.wallet.v1';

export interface ModeRecord {
  games: number;
  wins: number;
  coins: number;
  best: number;
}

export interface Wallet {
  coins: number;
  xp: number;
  records: Partial<Record<ModeId, ModeRecord>>;
  medals: Record<string, number>;
}

function loadWallet(): Wallet {
  try {
    const raw = localStorage.getItem(WALLET_KEY);
    if (raw) {
      const w = JSON.parse(raw) as Partial<Wallet>;
      return {
        coins: Math.max(0, Number(w.coins) || 0),
        xp: Math.max(0, Number(w.xp) || 0),
        records: w.records && typeof w.records === 'object' ? w.records : {},
        medals: w.medals && typeof w.medals === 'object' ? w.medals : {},
      };
    }
  } catch {
    /* sin almacenamiento */
  }
  return { coins: 0, xp: 0, records: {}, medals: {} };
}

/** Monedas, experiencia y récords por modo (se guardan en este navegador). */
export const wallet: Wallet = loadWallet();

export interface MatchReward {
  coins: number;
  xp: number;
  levelBefore: number;
  levelAfter: number;
  xpBefore: number;
  newBest: boolean;
}

/** Suma lo ganado en una partida y devuelve el antes/después para animarlo. */
export function addMatch(mode: ModeId, coins: number, won: boolean, medals: string[]): MatchReward {
  const xpGain = coins + (won ? 80 : 25) + medals.length * 20;
  const xpBefore = wallet.xp;
  const levelBefore = levelFor(xpBefore).level;
  wallet.coins += coins;
  wallet.xp += xpGain;
  const r = wallet.records[mode] ?? { games: 0, wins: 0, coins: 0, best: 0 };
  r.games++;
  if (won) r.wins++;
  r.coins += coins;
  const newBest = coins > r.best;
  if (newBest) r.best = coins;
  wallet.records[mode] = r;
  for (const m of medals) wallet.medals[m] = (wallet.medals[m] ?? 0) + 1;
  try {
    localStorage.setItem(WALLET_KEY, JSON.stringify(wallet));
  } catch {
    /* sin almacenamiento */
  }
  return { coins, xp: xpGain, levelBefore, levelAfter: levelFor(wallet.xp).level, xpBefore, newBest };
}
