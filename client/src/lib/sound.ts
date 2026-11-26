// Pure Web Audio API synthesizer for instant juicy feedback with zero audio file lag

let audioCtx: AudioContext | null = null;
let muted = localStorage.getItem('tianshu_muted') === '1';

function getCtx(): AudioContext | null {
  if (muted) return null;
  if (typeof window === 'undefined') return null;
  const Ctx = window.AudioContext || (window as any).webkitAudioContext;
  if (!Ctx) return null;
  if (!audioCtx) audioCtx = new Ctx();
  if (audioCtx.state === 'suspended') {
    void audioCtx.resume();
  }
  return audioCtx;
}

export function isSoundMuted(): boolean {
  return muted;
}

export function toggleSoundMute(): boolean {
  muted = !muted;
  localStorage.setItem('tianshu_muted', muted ? '1' : '0');
  return muted;
}

export function vibrate(pattern: number | number[]): void {
  if (muted) return;
  try {
    if (typeof navigator !== 'undefined' && navigator.vibrate) {
      navigator.vibrate(pattern);
    }
  } catch {}
}

function playTone(freq: number, startOffset: number, duration: number, type: OscillatorType = 'sine', gainPeak = 0.14) {
  const ctx = getCtx();
  if (!ctx) return;
  const now = ctx.currentTime + startOffset;
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, now);
  gain.gain.setValueAtTime(0.0001, now);
  gain.gain.exponentialRampToValueAtTime(gainPeak, now + 0.015);
  gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);
  osc.connect(gain);
  gain.connect(ctx.destination);
  osc.start(now);
  osc.stop(now + duration + 0.02);
}

// Crisp "叮！" system activation / notification chime
export function playSystemPing(): void {
  playTone(1046.5, 0, 0.18, 'sine', 0.14);
  playTone(1567.98, 0.07, 0.32, 'triangle', 0.16);
  vibrate(20);
}

// Cascading gold coins incoming
export function playCoinBurst(): void {
  const freqs = [880, 1174.66, 1396.91, 1760];
  freqs.forEach((f, idx) => playTone(f, idx * 0.055, 0.22, 'triangle', 0.13));
  vibrate([25, 20, 35]);
}

// 5x / 10x Crit Explosion fanfare
export function playCritExplosion(): void {
  const chord = [523.25, 659.25, 783.99, 1046.5, 1318.5, 1567.98];
  chord.forEach((f, idx) => playTone(f, idx * 0.045, 0.45, idx % 2 === 0 ? 'triangle' : 'sine', 0.16));
  vibrate([45, 30, 80, 25, 100]);
}

// WeChat message bubble chime
export function playWeChatChime(): void {
  playTone(740, 0, 0.1, 'sine', 0.11);
  playTone(987.77, 0.08, 0.16, 'sine', 0.12);
}

// Stone cracking / jade reveal
export function playStoneCrack(): void {
  playTone(220, 0, 0.09, 'sawtooth', 0.1);
  playTone(660, 0.1, 0.22, 'triangle', 0.14);
  playTone(1320, 0.18, 0.3, 'sine', 0.15);
  vibrate([30, 20, 50]);
}

// Crisp low-end dramatic hit for face-slap / reversal beats
export function playImpactSlap(): void {
  const ctx = getCtx();
  if (!ctx) return;
  const now = ctx.currentTime;

  // Sub-bass punch pitch drop
  const subOsc = ctx.createOscillator();
  const subGain = ctx.createGain();
  subOsc.type = 'sine';
  subOsc.frequency.setValueAtTime(145, now);
  subOsc.frequency.exponentialRampToValueAtTime(36, now + 0.19);
  subGain.gain.setValueAtTime(0.0001, now);
  subGain.gain.exponentialRampToValueAtTime(0.24, now + 0.008);
  subGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.22);
  subOsc.connect(subGain);
  subGain.connect(ctx.destination);
  subOsc.start(now);
  subOsc.stop(now + 0.24);

  // Crisp transient snap (filtered short burst)
  const snapOsc = ctx.createOscillator();
  const snapGain = ctx.createGain();
  snapOsc.type = 'triangle';
  snapOsc.frequency.setValueAtTime(320, now);
  snapOsc.frequency.exponentialRampToValueAtTime(85, now + 0.055);
  snapGain.gain.setValueAtTime(0.0001, now);
  snapGain.gain.exponentialRampToValueAtTime(0.14, now + 0.004);
  snapGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.065);
  snapOsc.connect(snapGain);
  snapGain.connect(ctx.destination);
  snapOsc.start(now);
  snapOsc.stop(now + 0.08);

  vibrate([35, 18, 50]);
}

// Subtle warm double-thump for tense / romantic heartbeat beats
export function playHeartbeat(): void {
  const ctx = getCtx();
  if (!ctx) return;
  const now = ctx.currentTime;

  const thump = (offset: number, startHz: number, endHz: number, peak: number, dur: number) => {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(startHz, now + offset);
    osc.frequency.exponentialRampToValueAtTime(endHz, now + offset + dur);
    gain.gain.setValueAtTime(0.0001, now + offset);
    gain.gain.exponentialRampToValueAtTime(peak, now + offset + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + offset + dur);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(now + offset);
    osc.stop(now + offset + dur + 0.02);
  };

  thump(0, 76, 44, 0.17, 0.13);
  thump(0.2, 66, 38, 0.12, 0.15);
  vibrate([22, 110, 18]);
}

// Warm crystalline chord for affection gain / tender moments
export function playAffectionChime(): void {
  const notes = [523.25, 659.25, 783.99, 987.77, 1174.66];
  notes.forEach((f, idx) => {
    playTone(f, idx * 0.048, 0.42, idx % 2 === 0 ? 'sine' : 'triangle', 0.095);
  });
  vibrate(18);
}

// Subtle UI click
export function playTap(): void {
  playTone(540, 0, 0.05, 'sine', 0.05);
}
