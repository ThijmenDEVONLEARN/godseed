import { describe, expect, it } from 'vitest';
import { createSimulation } from '../../sim/Simulation';
import { lineFor, speakable } from '../speaker';

const world = createSimulation(1).world;

describe('voice lines', () => {
  it('reads big gifts, chiefs, joins and the storm, skips small stuff', () => {
    expect(lineFor(world, { tick: 0, kind: 'god', text: 'mila summoned a DRAGON on Blue!', durationTicks: 1200 })).toContain('DRAGON');
    expect(lineFor(world, { tick: 0, kind: 'god', text: 'mila planted trees', durationTicks: 50 })).toBeUndefined();
    expect(lineFor(world, { tick: 0, kind: 'join', text: 'mila joined red' })).toBe('mila joined the red tribe!');
    expect(lineFor(world, { tick: 0, kind: 'storm', text: 'Lightning!', x: 1, y: 1 })).toBeUndefined();
    expect(lineFor(world, { tick: 0, kind: 'built', text: 'Red built a hut' })).toBeUndefined();
  });

  it('only reads kills made by viewers', () => {
    const npc = world.units.find((u) => !u.viewerId)!;
    expect(lineFor(world, { tick: 0, kind: 'kill', text: 'A red warrior slew x', unitId: npc.id })).toBeUndefined();
  });

  it('makes names speakable', () => {
    expect(speakable('mila_draws (red) slew Bob_2 (blue)')).toBe('mila draws of red slew Bob 2 of blue');
    expect(speakable('new CHIEF of RED')).toBe('new Chief of Red');
  });
});
