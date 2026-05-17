// Web Audio synthesis for tiny crab footstep + eat sounds. No assets ship;
// each sound is built on the fly with a few oscillators + an envelope.
//
// Mobile Safari starts AudioContext in 'suspended' and only allows playback
// after a user gesture. `unlockAudio()` should be called from any onClick /
// onTap handler — it's a no-op after the first successful resume.

let audioCtx: AudioContext | null = null;

function getCtx(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  if (!audioCtx) {
    try {
      // biome-ignore lint/suspicious/noExplicitAny: Safari prefix
      const Ctor: typeof AudioContext = (window as any).AudioContext ?? (window as any).webkitAudioContext;
      if (!Ctor) return null;
      audioCtx = new Ctor();
    } catch {
      return null;
    }
  }
  return audioCtx;
}

export function unlockAudio(): void {
  const ctx = getCtx();
  if (!ctx) return;
  if (ctx.state === 'suspended') {
    void ctx.resume().catch(() => {
      /* ignore — best-effort */
    });
  }
}

export function isAudioReady(): boolean {
  const ctx = getCtx();
  return !!ctx && ctx.state === 'running';
}

// Tiny chitin-on-rock "tk". Built as a brief noise burst through a
// narrow bandpass around 2 kHz, with a ~30ms exponential decay so it
// sounds tight and high — not bass-y. Frequency jitter per step keeps
// consecutive ticks from feeling mechanical.
export function playFootstep(volume = 0.045): void {
  const ctx = getCtx();
  if (!ctx || ctx.state !== 'running') return;
  const now = ctx.currentTime;
  const durSec = 0.045;
  // Generate a one-shot noise buffer.
  const buffer = ctx.createBuffer(1, Math.floor(ctx.sampleRate * durSec), ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
  const src = ctx.createBufferSource();
  src.buffer = buffer;

  // Bandpass to shape the burst into a tap. Slight per-tick frequency
  // variance keeps it organic.
  const bp = ctx.createBiquadFilter();
  bp.type = 'bandpass';
  bp.frequency.value = 2000 + Math.random() * 600;
  bp.Q.value = 7;

  // Roll off any remaining low rumble so it really doesn't bass-thud.
  const hp = ctx.createBiquadFilter();
  hp.type = 'highpass';
  hp.frequency.value = 1200;

  const gain = ctx.createGain();
  gain.gain.setValueAtTime(0, now);
  gain.gain.linearRampToValueAtTime(volume, now + 0.002);
  gain.gain.exponentialRampToValueAtTime(0.0001, now + durSec);

  src.connect(bp);
  bp.connect(hp);
  hp.connect(gain);
  gain.connect(ctx.destination);
  src.start(now);
  src.stop(now + durSec + 0.01);
}

// Sparkle on eat — short 2-tone chime.
export function playSparkle(volume = 0.05): void {
  const ctx = getCtx();
  if (!ctx || ctx.state !== 'running') return;
  const now = ctx.currentTime;
  for (const [f, dt] of [
    [880, 0],
    [1320, 0.04],
    [1760, 0.08],
  ] as const) {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.value = f;
    gain.gain.setValueAtTime(0, now + dt);
    gain.gain.linearRampToValueAtTime(volume, now + dt + 0.005);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + dt + 0.25);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(now + dt);
    osc.stop(now + dt + 0.3);
  }
}

// Soft "plop" for food landing in water.
export function playSplash(volume = 0.05): void {
  const ctx = getCtx();
  if (!ctx || ctx.state !== 'running') return;
  const now = ctx.currentTime;
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = 'sine';
  osc.frequency.setValueAtTime(380, now);
  osc.frequency.exponentialRampToValueAtTime(140, now + 0.18);
  gain.gain.setValueAtTime(0, now);
  gain.gain.linearRampToValueAtTime(volume, now + 0.01);
  gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.22);
  osc.connect(gain);
  gain.connect(ctx.destination);
  osc.start(now);
  osc.stop(now + 0.25);
}
