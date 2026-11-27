/**
 * Procedural Web Audio BGM & Ambient Soundscape Engine for 《天枢神豪》.
 * 100% zero-audio-file synthesis (compliant with DEV_GUIDE §11).
 *
 * Four bespoke scene moods with smooth crossfades:
 *  - lounge  : Midnight Bund Rhodes jazz chords (Home / Map / Assets / Profile)
 *  - romance : Delicate harp / music-box arpeggio + warm pad (Heroines / Dates / Bonds)
 *  - tension : Deep cinematic cello pad + subtle pulse (Main Story / Negotiation)
 *  - arcade  : Sleek pentatonic night-city groove (Minigames)
 */

export type BgmMood = 'lounge' | 'romance' | 'tension' | 'arcade';

const KEY_BGM = 'tianshu_bgm_enabled';
const KEY_AMB = 'tianshu_ambience_enabled';

function readPref(key: string, fallback: boolean): boolean {
  try {
    if (typeof window === 'undefined') return fallback;
    const v = localStorage.getItem(key);
    if (v === null) return fallback;
    return v === '1';
  } catch {
    return fallback;
  }
}

function writePref(key: string, val: boolean): void {
  try {
    if (typeof window !== 'undefined') localStorage.setItem(key, val ? '1' : '0');
  } catch {}
}

let bgmEnabled = readPref(KEY_BGM, true);
let ambienceEnabled = readPref(KEY_AMB, true);
let desiredMood: BgmMood = 'lounge';
let activeMood: BgmMood | null = null;
let started = false;
let stepTimer: ReturnType<typeof setInterval> | null = null;
let stepIdx = 0;

let ctx: AudioContext | null = null;
let masterGain: GainNode | null = null;
let musicGain: GainNode | null = null;
let ambGain: GainNode | null = null;
let ambNode: AudioBufferSourceNode | null = null;

function ensureContext(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  const Ctx = window.AudioContext || (window as any).webkitAudioContext;
  if (!Ctx) return null;
  if (!ctx) {
    ctx = new Ctx();
    masterGain = ctx.createGain();
    masterGain.gain.value = 0.72;
    masterGain.connect(ctx.destination);

    musicGain = ctx.createGain();
    musicGain.gain.value = bgmEnabled ? 0.24 : 0.0001;
    musicGain.connect(masterGain);

    ambGain = ctx.createGain();
    ambGain.gain.value = ambienceEnabled && bgmEnabled ? 0.065 : 0.0001;
    ambGain.connect(masterGain);
  }
  if (ctx.state === 'suspended') {
    void ctx.resume().catch(() => {});
  }
  return ctx;
}

function startAmbienceNoise(c: AudioContext) {
  if (ambNode || !ambGain) return;
  try {
    const length = c.sampleRate * 4;
    const buffer = c.createBuffer(1, length, c.sampleRate);
    const data = buffer.getChannelData(0);
    // Soft pink-ish rain/harbor breeze noise
    let b0 = 0;
    let b1 = 0;
    let b2 = 0;
    for (let i = 0; i < length; i += 1) {
      const white = Math.random() * 2 - 1;
      b0 = 0.997 * b0 + white * 0.029;
      b1 = 0.985 * b1 + white * 0.032;
      b2 = 0.95 * b2 + white * 0.048;
      data[i] = (b0 + b1 + b2 + white * 0.015) * 0.35;
    }
    const src = c.createBufferSource();
    src.buffer = buffer;
    src.loop = true;

    const filter = c.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 620;
    filter.Q.value = 0.7;

    src.connect(filter);
    filter.connect(ambGain);
    src.start();
    ambNode = src;
  } catch {}
}

function playNote(
  c: AudioContext,
  freq: number,
  dur: number,
  vol: number,
  type: OscillatorType = 'sine',
  attack = 0.04,
  offset = 0,
  cutoff = 1800,
) {
  if (!musicGain || !bgmEnabled) return;
  const now = c.currentTime + offset;
  const osc = c.createOscillator();
  const filt = c.createBiquadFilter();
  const gain = c.createGain();

  osc.type = type;
  osc.frequency.setValueAtTime(freq, now);

  filt.type = 'lowpass';
  filt.frequency.setValueAtTime(cutoff, now);

  gain.gain.setValueAtTime(0.0001, now);
  gain.gain.exponentialRampToValueAtTime(Math.max(0.0002, vol), now + attack);
  gain.gain.exponentialRampToValueAtTime(0.0001, now + dur);

  osc.connect(filt);
  filt.connect(gain);
  gain.connect(musicGain);

  osc.start(now);
  osc.stop(now + dur + 0.04);
}

// Musical chord tables (Hz)
const LOUNGE_CHORDS = [
  [130.81, 246.94, 293.66, 329.63, 392.0], // Cmaj9
  [110.0, 220.0, 261.63, 329.63, 392.0],   // Am9
  [174.61, 261.63, 329.63, 392.0, 440.0],  // Fmaj9
  [196.0, 246.94, 293.66, 349.23, 440.0],  // G13
];
const LOUNGE_MELODY = [523.25, 0, 587.33, 659.25, 0, 783.99, 659.25, 587.33];

const ROMANCE_ARPS = [
  [261.63, 329.63, 392.0, 493.88, 523.25, 493.88, 392.0, 329.63],
  [220.0, 261.63, 329.63, 392.0, 440.0, 392.0, 329.63, 261.63],
  [174.61, 220.0, 261.63, 329.63, 349.23, 329.63, 261.63, 220.0],
  [196.0, 246.94, 293.66, 392.0, 440.0, 392.0, 293.66, 246.94],
];

const TENSION_BASS = [73.42, 73.42, 87.31, 82.41]; // D2, D2, F2, E2
const TENSION_PADS = [
  [146.83, 220.0, 261.63, 329.63], // Dm9
  [146.83, 207.65, 261.63, 311.13],
  [174.61, 220.0, 261.63, 349.23],
  [164.81, 207.65, 246.94, 329.63],
];

const ARCADE_BASS = [110.0, 110.0, 130.81, 146.83, 164.81, 146.83, 130.81, 98.0];
const ARCADE_LEAD = [440.0, 523.25, 587.33, 659.25, 783.99, 659.25, 587.33, 523.25];

function tickMusic() {
  if (!bgmEnabled || !ctx || ctx.state !== 'running') return;
  const mood = activeMood || desiredMood;
  const beat = stepIdx % 8;
  const bar = Math.floor(stepIdx / 8) % 4;
  stepIdx += 1;

  if (mood === 'lounge') {
    if (beat === 0) {
      const chord = LOUNGE_CHORDS[bar];
      chord.forEach((f, idx) => {
        playNote(ctx!, f, 3.6, idx === 0 ? 0.14 : 0.055, idx === 0 ? 'sine' : 'triangle', 0.18, idx * 0.04, 1100);
      });
    }
    const m = LOUNGE_MELODY[(beat + bar) % LOUNGE_MELODY.length];
    if (m && beat % 2 === 1) {
      playNote(ctx, m, 1.35, 0.042, 'sine', 0.04, 0, 1600);
    }
  } else if (mood === 'romance') {
    const arp = ROMANCE_ARPS[bar];
    const freq = arp[beat];
    if (beat === 0) {
      playNote(ctx, arp[0] * 0.5, 3.5, 0.11, 'sine', 0.35, 0, 750);
    }
    playNote(ctx, freq, 1.4, 0.052, 'triangle', 0.025, 0, 2100);
    if (beat === 4) {
      playNote(ctx, freq * 2, 1.1, 0.024, 'sine', 0.03, 0.08, 2600);
    }
  } else if (mood === 'tension') {
    if (beat === 0) {
      playNote(ctx, TENSION_BASS[bar], 3.4, 0.16, 'triangle', 0.22, 0, 320);
      TENSION_PADS[bar].forEach((f, i) => {
        playNote(ctx!, f, 3.6, 0.042, 'sine', 0.45, i * 0.06, 900);
      });
    }
    if (beat === 2 || beat === 6) {
      playNote(ctx, TENSION_BASS[bar] * 2, 0.45, 0.065, 'sine', 0.02, 0, 420);
    }
  } else if (mood === 'arcade') {
    const b = ARCADE_BASS[beat];
    playNote(ctx, b, 0.38, 0.1, 'triangle', 0.015, 0, 680);
    if (beat % 2 === 0) {
      const lead = ARCADE_LEAD[(beat + bar * 2) % ARCADE_LEAD.length];
      playNote(ctx, lead, 0.34, 0.045, 'sine', 0.015, 0.02, 2200);
    }
  }
}

function restartScheduler(mood: BgmMood) {
  if (stepTimer) clearInterval(stepTimer);
  const intervalMs = mood === 'arcade' ? 320 : mood === 'romance' ? 520 : 620;
  stepTimer = setInterval(tickMusic, intervalMs);
}

function updateGains() {
  if (!ctx || !musicGain || !ambGain) return;
  const now = ctx.currentTime;
  const mTarget = bgmEnabled ? 0.24 : 0.0001;
  const aTarget = bgmEnabled && ambienceEnabled ? (activeMood === 'tension' || activeMood === 'lounge' ? 0.065 : 0.03) : 0.0001;
  musicGain.gain.cancelScheduledValues(now);
  musicGain.gain.setTargetAtTime(mTarget, now, 0.35);
  ambGain.gain.cancelScheduledValues(now);
  ambGain.gain.setTargetAtTime(aTarget, now, 0.45);
}

export function initBgmLifecycle(): void {
  if (typeof window === 'undefined' || started) return;
  started = true;

  const unlock = () => {
    const c = ensureContext();
    if (!c) return;
    startAmbienceNoise(c);
    activeMood = desiredMood;
    updateGains();
    if (!stepTimer) {
      tickMusic();
      restartScheduler(activeMood);
    }
    window.removeEventListener('pointerdown', unlock, true);
    window.removeEventListener('keydown', unlock, true);
  };

  window.addEventListener('pointerdown', unlock, true);
  window.addEventListener('keydown', unlock, true);

  document.addEventListener('visibilitychange', () => {
    if (!ctx || !masterGain) return;
    const now = ctx.currentTime;
    masterGain.gain.setTargetAtTime(document.hidden ? 0.0001 : 0.72, now, 0.2);
  });
}

export function setBgmMood(mood: BgmMood): void {
  desiredMood = mood;
  if (activeMood === mood) return;
  activeMood = mood;
  if (!ctx || !musicGain) return;

  // Smooth dip and rise crossfade
  const now = ctx.currentTime;
  if (bgmEnabled) {
    musicGain.gain.cancelScheduledValues(now);
    musicGain.gain.setTargetAtTime(0.03, now, 0.18);
    setTimeout(() => {
      updateGains();
    }, 280);
  }
  stepIdx = 0;
  restartScheduler(mood);
  tickMusic();
}

export function isBgmEnabled(): boolean {
  return bgmEnabled;
}

export function isAmbienceEnabled(): boolean {
  return ambienceEnabled;
}

export function toggleBgm(): boolean {
  bgmEnabled = !bgmEnabled;
  writePref(KEY_BGM, bgmEnabled);
  const c = ensureContext();
  if (c && bgmEnabled) {
    startAmbienceNoise(c);
    activeMood = desiredMood;
    if (!stepTimer) restartScheduler(activeMood);
    tickMusic();
  }
  updateGains();
  return bgmEnabled;
}

export function toggleAmbience(): boolean {
  ambienceEnabled = !ambienceEnabled;
  writePref(KEY_AMB, ambienceEnabled);
  const c = ensureContext();
  if (c && ambienceEnabled) startAmbienceNoise(c);
  updateGains();
  return ambienceEnabled;
}
