import { PHRASES, VOICE } from '../../shared/balance';
import type { Team } from '../../shared/sim/types';
import { settings } from '../config/settings';

/**
 * Voces de las frases con la Web Speech API (síntesis de voz del navegador).
 * Tono distinto por equipo, enfriamiento global y volumen según la distancia.
 */
class Voice {
  private last = 0;
  private spanish: SpeechSynthesisVoice | null = null;

  constructor() {
    if (!this.supported) return;
    const pick = () => {
      const voices = speechSynthesis.getVoices();
      this.spanish = voices.find((v) => v.lang === 'es-ES') ?? voices.find((v) => v.lang.startsWith('es')) ?? null;
    };
    pick();
    speechSynthesis.addEventListener?.('voiceschanged', pick);
  }

  get supported(): boolean {
    return typeof window !== 'undefined' && 'speechSynthesis' in window && typeof SpeechSynthesisUtterance !== 'undefined';
  }

  say(phrase: number, team: Team, distance: number, own: boolean): void {
    if (!settings.voices || !this.supported) return;
    if (!own && distance > VOICE.hearDistance) return;
    const now = performance.now();
    if (!own && now - this.last < VOICE.cooldown * 1000) return;
    this.last = now;
    const text = PHRASES.list[phrase];
    if (!text) return;
    try {
      // Mejor cortar la frase anterior que acumular un retraso.
      if (speechSynthesis.speaking) speechSynthesis.cancel();
      const u = new SpeechSynthesisUtterance(text);
      u.lang = VOICE.lang;
      if (this.spanish) u.voice = this.spanish;
      u.pitch = VOICE.pitch[team];
      u.rate = VOICE.rate[team];
      const near = own ? 1 : Math.max(0.25, 1 - distance / VOICE.hearDistance);
      u.volume = Math.min(1, settings.sfxVolume * 1.2 * near);
      speechSynthesis.speak(u);
    } catch {
      /* el navegador no deja hablar ahora */
    }
  }

  stop(): void {
    if (this.supported) speechSynthesis.cancel();
  }
}

export const voice = new Voice();
