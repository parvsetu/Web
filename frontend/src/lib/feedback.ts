// Haptic + audio feedback for scan results. Everything is feature-detected and
// failure-silent — feedback is a nicety, never a requirement.

type AudioCtxCtor = typeof AudioContext;

let ctx: AudioContext | null = null;

function getCtx(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  try {
    if (!ctx) {
      const Ctor: AudioCtxCtor | undefined =
        window.AudioContext ?? (window as unknown as { webkitAudioContext?: AudioCtxCtor }).webkitAudioContext;
      if (!Ctor) return null;
      ctx = new Ctor();
    }
    return ctx;
  } catch {
    return null;
  }
}

/** iOS/Safari only allow audio after a user gesture — call this from one. */
export function unlockAudio(): void {
  const c = getCtx();
  if (c && c.state === 'suspended') void c.resume().catch(() => undefined);
}

function tone(freq: number, start: number, duration: number, type: OscillatorType, gain = 0.25) {
  const c = getCtx();
  if (!c) return;
  const osc = c.createOscillator();
  const g = c.createGain();
  osc.type = type;
  osc.frequency.value = freq;
  const t0 = c.currentTime + start;
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(gain, t0 + 0.01);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + duration);
  osc.connect(g).connect(c.destination);
  osc.start(t0);
  osc.stop(t0 + duration + 0.02);
}

function vibrate(pattern: number | number[]) {
  try {
    if (typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function') navigator.vibrate(pattern);
  } catch {
    /* not supported */
  }
}

export function feedbackSuccess(): void {
  vibrate(120);
  try {
    unlockAudio();
    tone(1320, 0, 0.12, 'sine');
    tone(1760, 0.12, 0.16, 'sine');
  } catch {
    /* ignore */
  }
}

export function feedbackDeny(): void {
  vibrate([300, 120, 300, 120, 300]);
  try {
    unlockAudio();
    tone(180, 0, 0.35, 'square', 0.18);
    tone(150, 0.4, 0.45, 'square', 0.18);
  } catch {
    /* ignore */
  }
}

export function feedbackWarn(): void {
  vibrate([150, 80, 150]);
  try {
    unlockAudio();
    tone(440, 0, 0.2, 'triangle', 0.2);
  } catch {
    /* ignore */
  }
}
