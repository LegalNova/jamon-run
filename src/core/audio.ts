import { settings } from '../config/settings';

/**
 * Audio 8-bit generado con Web Audio: efectos sintetizados y un pequeño
 * secuenciador de música chiptune. No se carga ningún archivo.
 */

export type Sfx =
  | 'hover'
  | 'click'
  | 'back'
  | 'swing'
  | 'hit'
  | 'hurt'
  | 'block'
  | 'ko'
  | 'dash'
  | 'throw'
  | 'thud'
  | 'pickup'
  | 'heal'
  | 'tick'
  | 'reveal'
  | 'count'
  | 'go'
  | 'win'
  | 'lose'
  | 'smoke'
  | 'warning'
  | 'spawn'
  | 'denied'
  // modos y dopamina
  | 'coin'
  | 'combo'
  | 'boom'
  | 'fuse'
  | 'pass'
  | 'infect'
  | 'hintWhistle'
  | 'hintGiggle'
  | 'hintOink'
  | 'hintSqueak'
  | 'miss'
  | 'poof'
  | 'spinTick'
  | 'jackpot'
  | 'gallop'
  | 'fanfare'
  | 'levelup'
  | 'medal'
  | 'alarm'
  | 'horn'
  | 'slice'
  | 'cheer'
  | 'heart'
  | 'whoosh'
  | 'drum'
  | 'note0'
  | 'note1'
  | 'thump'
  | 'ball'

type Track = 'menu' | 'game' | 'vegas';

const NOTE_INDEX: Record<string, number> = { C: 0, 'C#': 1, D: 2, 'D#': 3, E: 4, F: 5, 'F#': 6, G: 7, 'G#': 8, A: 9, 'A#': 10, B: 11 };

function noteFreq(n: string): number {
  const m = /^([A-G]#?)(\d)$/.exec(n);
  if (!m) return 0;
  const midi = (parseInt(m[2], 10) + 1) * 12 + NOTE_INDEX[m[1]];
  return 440 * Math.pow(2, (midi - 69) / 12);
}

function seq(s: string): string[] {
  return s.trim().split(/\s+/);
}

interface Song {
  bpm: number;
  lead: string[];
  bass: string[];
  arp?: string[];
  drums: string[]; // k = bombo, s = caja, h = charles, - = nada
  leadWave: OscillatorType;
  leadVol: number;
}

const SONGS: Record<Track, Song> = {
  // Las Vegas: lounge de neón en re menor, con bajo andando y arpegio brillante.
  vegas: {
    bpm: 128,
    leadWave: 'sawtooth',
    leadVol: 0.07,
    lead: seq(`
      D5 - - F5 - A5 - - C6 - A5 - G5 - F5 -
      E5 - - G5 - A#5 - - A5 - G5 - E5 - C5 -
      D5 - - F5 - A5 - - D6 - C6 - A5 - G5 -
      A5 - - - G5 - F5 - E5 - - - C#5 - E5 -
      F5 - - A5 - C6 - - F6 - E6 - D6 - C6 -
      A#5 - - G5 - A#5 - - D6 - C6 - A#5 - A5 -
      A5 - F5 - D5 - F5 - A5 - G5 - F5 - E5 -
      D5 - - - - - A4 - D5 - - - - - - -
    `),
    bass: seq(`
      D2 - D3 - F2 - A2 - D2 - D3 - C3 - A2 -
      C2 - C3 - E2 - G2 - C2 - C3 - A#2 - G2 -
      D2 - D3 - F2 - A2 - D2 - D3 - C3 - A2 -
      A1 - A2 - C#2 - E2 - A1 - A2 - G2 - E2 -
      F2 - F3 - A2 - C3 - F2 - F3 - E3 - C3 -
      G2 - G3 - A#2 - D3 - G2 - G3 - F3 - D3 -
      A1 - A2 - C#2 - E2 - A1 - A2 - G2 - E2 -
      D2 - D3 - A2 - F2 - D2 - - D2 - - - -
    `),
    arp: seq(`D5 F5 A5 D6 A5 F5`),
    drums: seq(`k - h h s - h - k k h - s - h h`),
  },
  game: {
    bpm: 150,
    leadWave: 'square',
    leadVol: 0.11,
    lead: seq(`
      A4 - C5 - E5 - A5 - G5 - E5 - D5 - C5 -
      F4 - A4 - C5 - F5 - E5 - C5 - A4 - C5 -
      G4 - B4 - D5 - G5 - F5 - D5 - B4 - D5 -
      E5 - - - G#4 - B4 - E5 - D5 - C5 - B4 -
      A5 - - - E5 - A5 - C6 - B5 - A5 - E5 -
      F5 - - - C5 - F5 - A5 - G5 - F5 - C5 -
      G5 - - - D5 - G5 - B5 - A5 - G5 - D5 -
      E5 - G#5 - B5 - - - E6 - - - - - - -
    `),
    bass: seq(`
      A2 - A3 - A2 - A3 - A2 - A3 - A2 - A3 -
      F2 - F3 - F2 - F3 - F2 - F3 - F2 - F3 -
      G2 - G3 - G2 - G3 - G2 - G3 - G2 - G3 -
      E2 - E3 - E2 - E3 - E2 - E3 - G#2 - B2 -
      A2 - A3 - A2 - A3 - A2 - A3 - A2 - A3 -
      F2 - F3 - F2 - F3 - F2 - F3 - F2 - F3 -
      G2 - G3 - G2 - G3 - G2 - G3 - G2 - G3 -
      E2 - E3 - E2 - E3 - E2 - E2 - E2 - E2 -
    `),
    drums: seq(`k - h - s - h - k k h - s - h h`),
  },
  menu: {
    bpm: 112,
    leadWave: 'triangle',
    leadVol: 0.2,
    lead: seq(`
      E5 - G5 - C6 - - - B5 - G5 - E5 - - -
      A4 - C5 - E5 - - - D5 - C5 - A4 - - -
      F4 - A4 - C5 - - - E5 - D5 - C5 - - -
      D5 - - - B4 - - - G4 - A4 - B4 - D5 -
      E5 - G5 - C6 - - - D6 - C6 - B5 - G5 -
      A5 - - - E5 - - - C5 - D5 - E5 - - -
      F5 - E5 - D5 - C5 - A4 - C5 - D5 - F5 -
      E5 - D5 - C5 - - - - - - - G4 - - -
    `),
    bass: seq(`
      C3 - - - G3 - - - C3 - - - G3 - - -
      A2 - - - E3 - - - A2 - - - E3 - - -
      F2 - - - C3 - - - F2 - - - C3 - - -
      G2 - - - D3 - - - G2 - - - B2 - - -
      C3 - - - G3 - - - C3 - - - G3 - - -
      A2 - - - E3 - - - A2 - - - E3 - - -
      F2 - - - C3 - - - G2 - - - D3 - - -
      C3 - - - G2 - - - C3 - - - - - - -
    `),
    arp: seq(`C5 E5 G5 E5`),
    drums: seq(`k - - - h - - - s - - - h - h -`),
  },
};

class AudioEngine {
  private ctx: AudioContext | null = null;
  private master!: GainNode;
  private sfxGain!: GainNode;
  private musicGain!: GainNode;
  private noise!: AudioBuffer;
  private wantedTrack: Track | null = null;
  private currentTrack: Track | null = null;
  private step = 0;
  private nextTime = 0;
  private timer: number | null = null;
  private lastPlayed: Partial<Record<Sfx, number>> = {};
  /** Multiplicador de tempo de la música (Infección: se acelera al quedar pocos). */
  private tempo = 1;

  setTempo(k: number): void {
    this.tempo = Math.max(0.5, Math.min(2, k));
  }

  constructor() {
    const unlock = () => this.unlock();
    window.addEventListener('keydown', unlock);
    window.addEventListener('pointerdown', unlock);
    window.addEventListener('touchstart', unlock);
  }

  get unlocked(): boolean {
    return !!this.ctx && this.ctx.state === 'running';
  }

  unlock(): void {
    if (!this.ctx) {
      const Ctor = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (!Ctor) return;
      this.ctx = new Ctor();
      this.master = this.ctx.createGain();
      this.master.connect(this.ctx.destination);
      this.sfxGain = this.ctx.createGain();
      this.sfxGain.connect(this.master);
      this.musicGain = this.ctx.createGain();
      this.musicGain.connect(this.master);
      const len = this.ctx.sampleRate;
      this.noise = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
      const d = this.noise.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
      this.applyVolumes();
    }
    if (this.ctx.state === 'suspended') void this.ctx.resume();
    if (this.wantedTrack && this.currentTrack !== this.wantedTrack) this.startTrack(this.wantedTrack);
  }

  applyVolumes(): void {
    if (!this.ctx) return;
    this.sfxGain.gain.value = settings.sfxVolume * 0.55;
    this.musicGain.gain.value = settings.musicVolume * 0.3;
  }

  // ---------------------------------------------------------------- música

  playMusic(track: Track | null): void {
    this.wantedTrack = track;
    if (!this.ctx) return;
    if (track === this.currentTrack) return;
    if (track === null) this.stopMusic();
    else this.startTrack(track);
  }

  private stopMusic(): void {
    if (this.timer !== null) window.clearInterval(this.timer);
    this.timer = null;
    this.currentTrack = null;
  }

  private startTrack(track: Track): void {
    if (!this.ctx) return;
    this.stopMusic();
    this.currentTrack = track;
    this.step = 0;
    this.nextTime = this.ctx.currentTime + 0.08;
    this.timer = window.setInterval(() => this.schedule(), 25);
  }

  private schedule(): void {
    const ctx = this.ctx;
    if (!ctx || !this.currentTrack) return;
    const song = SONGS[this.currentTrack];
    const stepDur = 60 / (song.bpm * this.tempo) / 4;
    // Si la pestaña estuvo dormida, no intentamos "recuperar" notas.
    if (this.nextTime < ctx.currentTime - 0.2) this.nextTime = ctx.currentTime + 0.05;
    while (this.nextTime < ctx.currentTime + 0.12) {
      const t = this.nextTime;
      const s = this.step;
      const lead = song.lead[s % song.lead.length];
      if (lead !== '-') this.tone(this.musicGain, song.leadWave, noteFreq(lead), t, stepDur * 1.7, song.leadVol);
      const bass = song.bass[s % song.bass.length];
      if (bass !== '-') this.tone(this.musicGain, 'triangle', noteFreq(bass), t, stepDur * 1.6, 0.32);
      if (song.arp && s % 2 === 0) {
        const bar = Math.floor(s / 16) % 8;
        const shift = [0, -3, -7, -5, 0, -3, -7, 0][bar];
        const a = song.arp[(s / 2) % song.arp.length];
        this.tone(this.musicGain, 'square', noteFreq(a) * Math.pow(2, shift / 12), t, stepDur * 0.6, 0.025);
      }
      const dr = song.drums[s % song.drums.length];
      if (dr === 'k') this.kick(t);
      else if (dr === 's') this.snare(t);
      else if (dr === 'h') this.hat(t);
      this.step++;
      this.nextTime += stepDur;
    }
  }

  private kick(t: number): void {
    const ctx = this.ctx!;
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = 'sine';
    o.frequency.setValueAtTime(150, t);
    o.frequency.exponentialRampToValueAtTime(40, t + 0.12);
    g.gain.setValueAtTime(0.5, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.14);
    o.connect(g).connect(this.musicGain);
    o.start(t);
    o.stop(t + 0.15);
  }

  private snare(t: number): void {
    this.noiseBurst(this.musicGain, t, 0.12, 0.18, 'highpass', 1500);
  }

  private hat(t: number): void {
    this.noiseBurst(this.musicGain, t, 0.035, 0.06, 'highpass', 7000);
  }

  // ---------------------------------------------------------------- primitivas

  private tone(
    out: AudioNode,
    type: OscillatorType,
    freq: number,
    t: number,
    dur: number,
    vol: number,
    endFreq?: number,
  ): void {
    const ctx = this.ctx!;
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = type;
    const pm = out === this.sfxGain ? this.pitch : 1;
    o.frequency.setValueAtTime(freq * pm, t);
    if (endFreq) o.frequency.exponentialRampToValueAtTime(Math.max(20, endFreq * pm), t + dur);
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(vol, t + 0.005);
    g.gain.setValueAtTime(vol, t + dur * 0.6);
    g.gain.exponentialRampToValueAtTime(0.0008, t + dur);
    o.connect(g).connect(out);
    o.start(t);
    o.stop(t + dur + 0.02);
  }

  private noiseBurst(
    out: AudioNode,
    t: number,
    dur: number,
    vol: number,
    filter: BiquadFilterType,
    freq: number,
    endFreq?: number,
  ): void {
    const ctx = this.ctx!;
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    const f = ctx.createBiquadFilter();
    f.type = filter;
    f.frequency.setValueAtTime(freq, t);
    if (endFreq) f.frequency.exponentialRampToValueAtTime(endFreq, t + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0008, t + dur);
    src.connect(f).connect(g).connect(out);
    src.start(t, Math.random() * 0.5);
    src.stop(t + dur + 0.02);
  }

  private arp(notes: string[], t: number, stepDur: number, type: OscillatorType, vol: number): void {
    notes.forEach((n, i) => this.tone(this.sfxGain, type, noteFreq(n), t + i * stepDur, stepDur * 1.4, vol));
  }

  // ---------------------------------------------------------------- efectos

  /** Multiplicador de tono del sonido que se está generando (sube en combos y rachas). */
  private pitch = 1;

  play(name: Sfx, pitch = 1): void {
    this.pitch = pitch;
    if (!this.ctx || this.ctx.state !== 'running') return;
    const ctx = this.ctx;
    const now = ctx.currentTime;
    // Evita que el mismo sonido se apile en el mismo instante.
    const last = this.lastPlayed[name] ?? -1;
    if (now - last < 0.03) return;
    this.lastPlayed[name] = now;
    const out = this.sfxGain;
    const t = now + 0.001;
    switch (name) {
      case 'hover':
        this.tone(out, 'square', 1320, t, 0.03, 0.05);
        break;
      case 'click':
        this.tone(out, 'square', 660, t, 0.05, 0.1);
        this.tone(out, 'square', 990, t + 0.05, 0.07, 0.1);
        break;
      case 'back':
        this.tone(out, 'square', 520, t, 0.05, 0.09);
        this.tone(out, 'square', 350, t + 0.05, 0.08, 0.09);
        break;
      case 'denied':
        this.tone(out, 'square', 140, t, 0.12, 0.12);
        break;
      case 'swing':
        this.noiseBurst(out, t, 0.13, 0.3, 'bandpass', 2400, 500);
        break;
      case 'hit':
        this.noiseBurst(out, t, 0.09, 0.5, 'lowpass', 3000, 400);
        this.tone(out, 'square', 260, t, 0.12, 0.22, 55);
        break;
      case 'hurt':
        this.tone(out, 'square', 620, t, 0.16, 0.13, 180);
        break;
      case 'block':
        this.tone(out, 'triangle', 1500, t, 0.18, 0.2);
        this.tone(out, 'square', 2250, t, 0.1, 0.06);
        this.noiseBurst(out, t, 0.06, 0.2, 'highpass', 4000);
        break;
      case 'ko':
        this.arp(['E5', 'C5', 'A4', 'E4', 'C4'], t, 0.06, 'square', 0.12);
        this.noiseBurst(out, t, 0.3, 0.25, 'lowpass', 1200, 100);
        break;
      case 'dash':
        this.noiseBurst(out, t, 0.16, 0.25, 'bandpass', 600, 3500);
        this.tone(out, 'triangle', 300, t, 0.12, 0.12, 900);
        break;
      case 'throw':
        this.tone(out, 'sawtooth', 240, t, 0.14, 0.09, 720);
        this.noiseBurst(out, t, 0.12, 0.15, 'bandpass', 1500, 3000);
        break;
      case 'thud':
        this.noiseBurst(out, t, 0.1, 0.3, 'lowpass', 800, 150);
        break;
      case 'pickup':
        this.arp(['C5', 'E5', 'G5', 'C6'], t, 0.045, 'square', 0.1);
        break;
      case 'heal':
        this.arp(['G4', 'C5', 'E5', 'G5', 'C6'], t, 0.05, 'triangle', 0.22);
        break;
      case 'tick':
        this.tone(out, 'square', 1100, t, 0.025, 0.07);
        break;
      case 'reveal':
        this.arp(['C5', 'E5', 'G5'], t, 0.07, 'square', 0.1);
        this.tone(out, 'square', noteFreq('C6'), t + 0.21, 0.45, 0.1);
        this.tone(out, 'triangle', noteFreq('C4'), t + 0.21, 0.45, 0.25);
        break;
      case 'count':
        this.tone(out, 'square', 440, t, 0.14, 0.12);
        break;
      case 'go':
        this.tone(out, 'square', 880, t, 0.35, 0.13);
        this.tone(out, 'triangle', 440, t, 0.35, 0.25);
        break;
      case 'win':
        this.arp(['C5', 'E5', 'G5', 'C6', 'G5', 'C6'], t, 0.1, 'square', 0.11);
        this.tone(out, 'triangle', noteFreq('C4'), t, 0.7, 0.25);
        break;
      case 'lose':
        this.arp(['G4', 'F#4', 'F4', 'E4'], t, 0.18, 'square', 0.11);
        this.tone(out, 'triangle', noteFreq('C3'), t + 0.54, 0.6, 0.25);
        break;
      case 'smoke':
        this.noiseBurst(out, t, 0.45, 0.35, 'lowpass', 1800, 200);
        break;
      case 'warning':
        this.tone(out, 'square', 990, t, 0.08, 0.09);
        this.tone(out, 'square', 990, t + 0.14, 0.08, 0.09);
        break;
      case 'spawn':
        this.tone(out, 'triangle', 700, t, 0.12, 0.12, 1400);
        break;
      case 'coin':
        this.tone(out, 'square', noteFreq('B5'), t, 0.06, 0.08);
        this.tone(out, 'square', noteFreq('E6'), t + 0.06, 0.16, 0.08);
        break;
      case 'combo':
        this.arp(['E5', 'G#5', 'B5', 'E6'], t, 0.04, 'square', 0.09);
        break;
      case 'boom':
        this.noiseBurst(out, t, 0.9, 0.7, 'lowpass', 2200, 60);
        this.tone(out, 'sine', 120, t, 0.6, 0.6, 30);
        break;
      case 'fuse':
        this.noiseBurst(out, t, 0.05, 0.12, 'bandpass', 3500);
        break;
      case 'pass':
        this.tone(out, 'square', 520, t, 0.09, 0.1, 1040);
        break;
      case 'infect':
        this.tone(out, 'sawtooth', 220, t, 0.35, 0.12, 90);
        this.noiseBurst(out, t, 0.25, 0.15, 'bandpass', 900, 300);
        break;
      case 'hintWhistle':
        this.tone(out, 'sine', 1200, t, 0.18, 0.18, 1800);
        this.tone(out, 'sine', 1800, t + 0.2, 0.25, 0.18, 1100);
        break;
      case 'hintGiggle':
        this.arp(['A5', 'G5', 'A5', 'G5', 'A5'], t, 0.06, 'triangle', 0.16);
        break;
      case 'hintOink':
        this.tone(out, 'sawtooth', 300, t, 0.12, 0.14, 180);
        this.tone(out, 'sawtooth', 320, t + 0.16, 0.14, 0.14, 170);
        break;
      case 'hintSqueak':
        this.tone(out, 'square', 1500, t, 0.1, 0.08, 2600);
        break;
      case 'miss':
        this.tone(out, 'square', 300, t, 0.08, 0.1, 150);
        this.noiseBurst(out, t, 0.12, 0.2, 'lowpass', 900);
        break;
      case 'poof':
        this.noiseBurst(out, t, 0.25, 0.25, 'highpass', 900, 3000);
        break;
      case 'spinTick':
        this.tone(out, 'square', 1500, t, 0.02, 0.05);
        break;
      case 'jackpot':
        this.arp(['C5', 'E5', 'G5', 'C6', 'E6', 'G6', 'C7'], t, 0.06, 'square', 0.12);
        this.tone(out, 'triangle', noteFreq('C4'), t, 0.9, 0.25);
        break;
      case 'gallop':
        this.noiseBurst(out, t, 0.04, 0.2, 'lowpass', 600);
        this.noiseBurst(out, t + 0.09, 0.04, 0.16, 'lowpass', 500);
        break;
      case 'fanfare':
        this.arp(['G4', 'C5', 'E5', 'G5', 'E5', 'G5', 'C6'], t, 0.09, 'square', 0.12);
        this.tone(out, 'triangle', noteFreq('C3'), t, 0.8, 0.25);
        break;
      case 'levelup':
        this.arp(['C5', 'D5', 'E5', 'G5', 'C6', 'D6', 'E6', 'G6'], t, 0.05, 'square', 0.11);
        break;
      case 'medal':
        this.arp(['E5', 'B5', 'E6'], t, 0.08, 'triangle', 0.2);
        break;
      case 'horn':
        // corneta: dos notas largas que suben
        this.tone(out, 'sawtooth', noteFreq('G4'), t, 0.18, 0.13);
        this.tone(out, 'sawtooth', noteFreq('C5'), t + 0.18, 0.18, 0.13);
        this.tone(out, 'sawtooth', noteFreq('E5'), t + 0.36, 0.5, 0.15);
        this.tone(out, 'square', noteFreq('C4'), t + 0.36, 0.5, 0.08);
        break;
      case 'slice':
        this.noiseBurst(out, t, 0.12, 0.35, 'highpass', 2500, 7000);
        this.tone(out, 'triangle', 1800, t, 0.05, 0.1, 900);
        break;
      case 'cheer':
        this.noiseBurst(out, t, 0.7, 0.18, 'bandpass', 1200, 1800);
        break;
      case 'heart':
        this.tone(out, 'sine', 70, t, 0.1, 0.45, 50);
        this.tone(out, 'sine', 65, t + 0.16, 0.1, 0.35, 45);
        break;
      case 'whoosh':
        this.noiseBurst(out, t, 0.25, 0.25, 'bandpass', 600, 2400);
        break;
      case 'drum':
        this.tone(out, 'sine', 160, t, 0.12, 0.5, 45);
        break;
      case 'note0':
        this.tone(out, 'square', noteFreq(['C5', 'E5', 'G5', 'A5'][Math.floor(Math.random() * 4)]), t, 0.12, 0.09);
        break;
      case 'note1':
        this.tone(out, 'square', noteFreq(['D5', 'F5', 'A5', 'C6'][Math.floor(Math.random() * 4)]), t, 0.12, 0.09);
        break;
      case 'thump':
        this.tone(out, 'triangle', 220, t, 0.08, 0.25, 110);
        break;
      case 'ball':
        this.tone(out, 'square', 2200 + Math.random() * 800, t, 0.015, 0.05);
        break;
      case 'alarm':
        this.tone(out, 'square', 660, t, 0.15, 0.1, 990);
        this.tone(out, 'square', 660, t + 0.2, 0.15, 0.1, 990);
        break;
    }
  }
}

export const audio = new AudioEngine();
