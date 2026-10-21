import { DurableObject } from 'cloudflare:workers';
import {
  applyReport,
  ApplyResult,
  buy,
  claimDaily,
  claimMission,
  CosCat,
  equip,
  Equipped,
  newProfile,
  PlayReport,
  Profile as ProfileData,
  Notice,
  refresh,
  settleRoulette,
} from '../../shared/economy';
import type { Env } from './index';

/**
 * Perfil de un jugador (un Durable Object por jugador): lonchas, nivel, misiones, tienda.
 * El navegador nunca escribe el saldo: solo pide operaciones y el servidor decide.
 */
export class Profile extends DurableObject<Env> {
  private data: ProfileData | null = null;
  private seed = '';

  private async load(seed: string): Promise<ProfileData> {
    if (!this.data) this.data = (await this.ctx.storage.get<ProfileData>('p')) ?? (await this.fromLegacy(seed)) ?? newProfile();
    this.seed = seed || this.seed;
    refresh(this.data, this.seed);
    return this.data;
  }

  private async save(): Promise<void> {
    if (this.data) await this.ctx.storage.put('p', this.data);
  }

  /** Perfil de antes del cambio de nombre (Worker jamon-run), si existía. */
  private async fromLegacy(seed: string): Promise<ProfileData | null> {
    if (!this.env.LEGACY || !seed) return null;
    try {
      const res = await this.env.LEGACY.fetch(`https://legacy/api/legacy-profile?id=${encodeURIComponent(seed)}`);
      if (!res.ok) return null;
      const data = (await res.json()) as { profile: ProfileData | null };
      return data.profile && data.profile.v === 1 ? data.profile : null;
    } catch {
      return null;
    }
  }

  /** Solo lectura (para el traspaso): null si nunca se usó. */
  async peek(): Promise<ProfileData | null> {
    return (await this.ctx.storage.get<ProfileData>('p')) ?? null;
  }

  async get(seed: string): Promise<ProfileData> {
    const p = await this.load(seed);
    await this.save();
    return p;
  }

  async equipped(seed: string): Promise<{ eq: Equipped; streak: number; level: number; xp: number }> {
    const p = await this.load(seed);
    return { eq: p.equipped, streak: p.mgStreak, level: 0, xp: p.xp };
  }

  async daily(seed: string): Promise<{ profile: ProfileData; amount: number; streak: number; ok: boolean }> {
    const p = await this.load(seed);
    const r = claimDaily(p);
    await this.save();
    return { profile: p, ...r };
  }

  async buy(seed: string, id: string): Promise<{ profile: ProfileData; ok: boolean; why?: string; notices: unknown[] }> {
    const p = await this.load(seed);
    const r = buy(p, String(id));
    await this.save();
    return { profile: p, ...r };
  }

  async equip(seed: string, cat: CosCat, id: string | null): Promise<{ profile: ProfileData; ok: boolean }> {
    const p = await this.load(seed);
    const ok = equip(p, cat, id);
    await this.save();
    return { profile: p, ok };
  }

  async claim(seed: string, id: string): Promise<{ profile: ProfileData; amount: number }> {
    const p = await this.load(seed);
    const amount = claimMission(p, String(id));
    await this.save();
    return { profile: p, amount };
  }

  /** Evento Ruleta: el número ya lo ha decidido el servidor. */
  async roulette(seed: string, color: string, amount: number, pocket: string): Promise<{ profile: ProfileData; delta: number; notices: Notice[] }> {
    const p = await this.load(seed);
    const r = settleRoulette(p, color, amount, pocket);
    await this.save();
    return { profile: p, ...r };
  }

  async balance(seed: string): Promise<number> {
    return (await this.load(seed)).lonchas;
  }

  /** Una partida o minijuego. online = lo ha calculado el servidor de la sala. */
  async report(seed: string, r: PlayReport, online: boolean): Promise<ApplyResult & { profile: ProfileData }> {
    const p = await this.load(seed);
    const res = applyReport(p, r, !online);
    await this.save();
    return { ...res, profile: p };
  }
}
