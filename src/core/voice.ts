import { PHRASES, VOICE } from '../../shared/balance';
import type { Team } from '../../shared/sim/types';
import { settings } from '../config/settings';

/**
 * Voces de las frases con la Web Speech API (síntesis de voz del navegador).
 * Tono distinto por equipo, enfriamiento global y volumen según la distancia.
 */
class Voice {
  private last = 0;
  /** Una voz por equipo (si el sistema tiene varias en español). */
  private voices: Record<Team, SpeechSynthesisVoice | null> = { chaser: null, escapist: null };

  constructor() {
    if (!this.supported) return;
    const pick = () => {
      const all = speechSynthesis.getVoices();
      const es = all.filter((v) => v.lang === 'es-ES');
      const list = es.length ? es : all.filter((v) => v.lang.startsWith('es'));
      this.voices = { chaser: list[0] ?? null, escapist: list[1] ?? list[0] ?? null };
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
      const v = this.voices[team];
      if (v) u.voice = v;
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
