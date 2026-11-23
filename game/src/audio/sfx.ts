import type { Sfx } from '../render3d/fx';

/** One sound piece: a tone sliding from `f` to `f2`, or filtered noise sweeping its filter from `f` to `f2`. */
interface Piece { noise?: BiquadFilterType; wave?: OscillatorType; f: number; f2?: number; dur: number; gain: number; at?: number }

const tone = (f: number, f2: number, dur: number, gain: number, wave: OscillatorType = 'sine', at = 0): Piece => ({ wave, f, f2, dur, gain, at });
const noise = (filter: BiquadFilterType, f: number, f2: number, dur: number, gain: number, at = 0): Piece => ({ noise: filter, f, f2, dur, gain, at });
const notes = (fs: number[], step: number, dur: number, gain: number, wave: OscillatorType = 'triangle') => fs.map((f, i) => tone(f, f, dur, gain, wave, i * step));

/** Every sound is made in the browser from tones and noise: no sound files, nothing to license. */
const RECIPES: Record<Sfx, () => Piece[]> = {
  pop: () => [tone(500, 950, 0.09, 0.5)],
  rumble: () => [noise('lowpass', 220, 90, 1.4, 0.9), tone(52, 36, 1.2, 0.5)],
  zing: () => [tone(1100, 2600, 0.3, 0.25, 'triangle'), tone(2200, 3400, 0.25, 0.1, 'sine', 0.05)],
  hum: () => [tone(220, 220, 1, 0.25), tone(330, 332, 1, 0.15)],
  thunder: () => [noise('highpass', 2500, 1200, 0.12, 0.6), noise('lowpass', 900, 120, 2, 1.2, 0.05)],
  whistle: () => [tone(1900, 450, 1, 0.22)],
  boom: () => [noise('lowpass', 500, 60, 1.1, 1.3), tone(90, 30, 0.9, 0.8)],
  howl: () => [tone(380, 720, 0.6, 0.18, 'triangle'), tone(720, 340, 0.9, 0.18, 'triangle', 0.6)],
  land: () => [noise('lowpass', 320, 90, 0.35, 0.9), tone(130, 50, 0.3, 0.6)],
  roar: () => [noise('bandpass', 340, 220, 1.3, 1), tone(95, 65, 1.2, 0.25, 'sawtooth')],
  wind: () => [noise('bandpass', 500, 950, 2.2, 0.5)],
  cough: () => [noise('bandpass', 900, 700, 0.12, 0.6), noise('bandpass', 850, 650, 0.12, 0.5, 0.2)],
  eruption: () => [noise('lowpass', 600, 50, 2.4, 1.3), tone(70, 28, 2, 0.8), noise('highpass', 3000, 1500, 0.8, 0.15, 0.3)],
  wave: () => [noise('lowpass', 1400, 260, 1.8, 0.8)],
  harp: () => notes([523, 659, 784, 1047, 1319], 0.1, 0.9, 0.18),
  drone: () => [tone(110, 110, 2.2, 0.22), tone(116, 114, 2.2, 0.18)],
  coins: () => Array.from({ length: 7 }, (_, i) => tone(2000 + Math.random() * 1400, 2600 + Math.random() * 1200, 0.12, 0.2, 'triangle', i * 0.07)),
  stomp: () => [tone(75, 38, 0.35, 0.9), noise('lowpass', 180, 80, 0.3, 0.7)],
  chime: () => [tone(1320, 1320, 0.9, 0.18), tone(1980, 1980, 0.7, 0.1, 'sine', 0.08)],
  hit: () => [noise('highpass', 2400, 1800, 0.06, 0.5), tone(320, 140, 0.09, 0.2, 'square')],
  crash: () => [noise('lowpass', 2200, 300, 0.9, 1), tone(110, 40, 0.6, 0.5)],
  fanfare: () => [...notes([392, 523, 659], 0.13, 0.16, 0.18, 'square'), tone(784, 784, 0.8, 0.2, 'square', 0.39), tone(392, 392, 0.8, 0.12, 'triangle', 0.39)],
};

/** The same sound at most this often, so a gift storm does not stack into noise. */
const MIN_GAP_S = 0.12;

/**
 * Game sounds for the `fx.onSound` hooks. Browsers only start audio after a click or key press, so the
 * stream PC starts Chrome with `--autoplay-policy=no-user-gesture-required`; otherwise the first click wakes it.
 */
export function createSfx(volume = 0.35, makeCtx: () => AudioContext = () => new AudioContext()) {
  let ctx: AudioContext | undefined, out: AudioNode | undefined, noiseBuf: AudioBuffer | undefined;
  const last = new Map<Sfx, number>();
  const wake = () => {
    if (!ctx) {
      ctx = makeCtx();
      const gain = ctx.createGain();
      gain.gain.value = volume;
      const comp = ctx.createDynamicsCompressor(); // big moments (eruption + thunder) stay below clipping
      gain.connect(comp).connect(ctx.destination);
      out = gain;
      noiseBuf = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
      const d = noiseBuf.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    }
    if (ctx.state === 'suspended') void ctx.resume();
    return ctx;
  };
  if (typeof addEventListener === 'function') for (const ev of ['pointerdown', 'keydown']) addEventListener(ev, wake);

  const piece = (c: AudioContext, p: Piece) => {
    const t = c.currentTime + (p.at ?? 0), end = t + p.dur, f2 = p.f2 ?? p.f;
    const env = c.createGain();
    env.gain.setValueAtTime(0.0001, t);
    env.gain.exponentialRampToValueAtTime(p.gain, t + Math.min(0.02, p.dur / 4));
    env.gain.exponentialRampToValueAtTime(0.0001, end);
    env.connect(out!);
    let src: AudioScheduledSourceNode;
    if (p.noise) {
      const n = c.createBufferSource();
      n.buffer = noiseBuf!;
      n.loop = true;
      const filter = c.createBiquadFilter();
      filter.type = p.noise;
      filter.frequency.setValueAtTime(p.f, t);
      filter.frequency.exponentialRampToValueAtTime(f2, end);
      n.connect(filter).connect(env);
      src = n;
    } else {
      const o = c.createOscillator();
      o.type = p.wave ?? 'sine';
      o.frequency.setValueAtTime(p.f, t);
      o.frequency.exponentialRampToValueAtTime(f2, end);
      o.connect(env);
      src = o;
    }
    src.start(t);
    src.stop(end + 0.05);
  };

  return {
    play(id: Sfx): void {
      const c = wake();
      if (c.state !== 'running') return; // not yet woken: drop it, or it would all play at once after the first click
      if (c.currentTime - (last.get(id) ?? -1) < MIN_GAP_S) return;
      last.set(id, c.currentTime);
      for (const p of RECIPES[id]()) piece(c, p);
    },
  };
}
