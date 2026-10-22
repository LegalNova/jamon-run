/**
 * Calidad automática: si la partida va a menos de ~42 FPS durante unos segundos,
 * baja partículas y efectos (sin tocar la jugabilidad). "Alta" y "Baja" la fijan a mano.
 */
import { settings } from '../config/settings';

const AUTO = { minFps: 42, after: 4, recoverFps: 56 };

class Quality {
  private ema = 60;
  private slow = 0;
  private autoLow = false;

  /** true = menos partículas, sin ambiente y sin parpadeos de neón. */
  get low(): boolean {
    return settings.quality === 'baja' || (settings.quality === 'auto' && this.autoLow);
  }

  /** Multiplicador de partículas por ráfaga. */
  get particles(): number {
    return this.low ? 0.4 : settings.reduceFx ? 0.6 : 1;
  }

  /** Se llama cada frame de partida con el tiempo real transcurrido. */
  sample(dt: number): void {
    if (dt <= 0 || dt > 0.5) return;
    this.ema += (1 / dt - this.ema) * Math.min(1, dt * 2);
    if (this.ema < AUTO.minFps) this.slow += dt;
    else this.slow = Math.max(0, this.slow - dt);
    if (!this.autoLow && this.slow > AUTO.after) this.autoLow = true;
  }

  get fps(): number {
    return Math.round(this.ema);
  }
}

export const quality = new Quality();
