import { describe, expect, it } from 'vitest';
import { createSfx } from '../sfx';
import type { Sfx } from '../../render3d/fx';

/** Just enough of an AudioContext to count what gets started. */
function fakeCtx() {
  const started: number[] = [];
  const param = () => ({ value: 0, setValueAtTime() {}, exponentialRampToValueAtTime() {} });
  const node = () => ({ connect: (n: unknown) => n, gain: param(), frequency: param(), start: (t: number) => started.push(t), stop() {} });
  const ctx = {
    state: 'running', currentTime: 0, sampleRate: 8000, destination: {},
    createGain: node, createDynamicsCompressor: node, createBiquadFilter: node, createOscillator: node,
    createBufferSource: () => ({ ...node(), buffer: null, loop: false }),
    createBuffer: (_c: number, n: number) => ({ getChannelData: () => new Float32Array(n) }),
    resume() {},
  };
  return { ctx, started };
}

describe('sfx', () => {
  const ALL: Sfx[] = ['pop', 'rumble', 'zing', 'hum', 'thunder', 'whistle', 'boom', 'howl', 'land', 'roar', 'wind', 'cough', 'eruption', 'wave', 'harp', 'drone', 'coins', 'stomp', 'chime', 'hit', 'crash', 'fanfare'];

  it('makes a sound for every hook', () => {
    const { ctx, started } = fakeCtx();
    const sfx = createSfx(0.3, () => ctx as unknown as AudioContext);
    for (const id of ALL) { const before = started.length; sfx.play(id); expect(started.length, id).toBeGreaterThan(before); }
  });

  it('plays the same sound at most once per 0.12 s, and nothing before audio is woken', () => {
    const { ctx, started } = fakeCtx();
    const sfx = createSfx(0.3, () => ctx as unknown as AudioContext);
    sfx.play('pop'); sfx.play('pop');
    expect(started).toHaveLength(1);
    ctx.currentTime = 0.2; sfx.play('pop');
    expect(started).toHaveLength(2);
    ctx.state = 'suspended'; ctx.currentTime = 1; sfx.play('pop');
    expect(started).toHaveLength(2);
  });
});
