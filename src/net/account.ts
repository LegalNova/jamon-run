/**
 * Tu perfil en el servidor: lonchas, nivel, misiones, cosméticos.
 * El navegador solo pide cosas; el saldo lo decide siempre el servidor.
 */
import type { ApplyResult, CosCat, Notice, PlayReport, Profile } from '../../shared/economy';
import { playerId } from '../config/profile';

type Listener = () => void;
type NoticeListener = (n: Notice) => void;

class Account {
  profile: Profile | null = null;
  /** No hay servidor (p. ej. sin conexión): se puede jugar, pero no se ganan lonchas. */
  offline = false;
  private listeners = new Set<Listener>();
  private noticeListeners = new Set<NoticeListener>();
  private loading: Promise<void> | null = null;

  get id(): string {
    return playerId();
  }

  get lonchas(): number {
    return this.profile?.lonchas ?? 0;
  }

  onChange(fn: Listener): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  onNotice(fn: NoticeListener): () => void {
    this.noticeListeners.add(fn);
    return () => this.noticeListeners.delete(fn);
  }

  private set(p: Profile | undefined): void {
    if (!p) return;
    this.profile = p;
    this.offline = false;
    for (const fn of this.listeners) fn();
  }

  notify(ns: Notice[]): void {
    for (const n of ns) for (const fn of this.noticeListeners) fn(n);
  }

  private async post<T extends { profile?: Profile }>(body: Record<string, unknown>): Promise<T | null> {
    try {
      const res = await fetch('./api/me', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ id: this.id, ...body }) });
      if (!res.ok) return null;
      const data = (await res.json()) as T;
      this.set(data.profile);
      return data;
    } catch {
      this.offline = true;
      return null;
    }
  }

  load(): Promise<void> {
    if (!this.loading) {
      this.loading = this.post<{ profile: Profile }>({ op: 'get' }).then(() => {
        this.loading = null;
      });
    }
    return this.loading;
  }

  async daily(): Promise<{ ok: boolean; amount: number; streak: number } | null> {
    return this.post<{ profile: Profile; ok: boolean; amount: number; streak: number }>({ op: 'daily' });
  }

  async buy(item: string): Promise<{ ok: boolean; why?: string } | null> {
    const r = await this.post<{ profile: Profile; ok: boolean; why?: string; notices: Notice[] }>({ op: 'buy', item });
    if (r?.notices) this.notify(r.notices);
    return r;
  }

  async equip(cat: CosCat, item: string | null): Promise<boolean> {
    const r = await this.post<{ profile: Profile; ok: boolean }>({ op: 'equip', cat, item });
    return !!r?.ok;
  }

  async claim(mission: string): Promise<number> {
    const r = await this.post<{ profile: Profile; amount: number }>({ op: 'claim', mission });
    return r?.amount ?? 0;
  }

  /** Partida o minijuego sin servidor: el perfil le aplica topes. */
  async reportOffline(report: PlayReport): Promise<ApplyResult | null> {
    const r = await this.post<ApplyResult & { profile: Profile }>({ op: 'offline', report });
    if (r) {
      this.lastReward = { res: r, at: performance.now() };
      this.notify(r.notices);
    }
    return r;
  }

  /** Experiencia al empezar la partida (para animar la barra al acabar). */
  xpAtStart: number | null = null;

  /** Última recompensa recibida (para la pantalla de resultados). */
  lastReward: { res: ApplyResult; at: number } | null = null;

  /** Recompensa de una partida online (la manda la sala). */
  applyReward(res: ApplyResult): void {
    this.lastReward = { res, at: performance.now() };
    this.notify(res.notices);
    void this.load();
  }

  owns(id: string): boolean {
    return !!this.profile?.owned.includes(id);
  }
}

export const account = new Account();
