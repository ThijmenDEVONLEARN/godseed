import { TEAMS } from '@godseed/shared';
import { describe, expect, it } from 'vitest';
import { BALANCE } from '../../config/balance';
import { hashValue } from '../hash';
import { createSimulation } from '../Simulation';
import { newRound } from '../systems/round';

const run = (seed: number, ticks: number) => {
  const sim = createSimulation(seed);
  const kinds: Record<string, number> = {};
  for (let i = 0; i < ticks; i++) for (const e of sim.step()) kinds[e.kind] = (kinds[e.kind] ?? 0) + 1;
  return { sim, kinds };
};

describe('simulation', () => {
  it('tribes grow, build and raid over 10 minutes', () => {
    const { sim, kinds } = run(7, 6000);
    const w = sim.world;
    for (const team of TEAMS) {
      const done = w.buildings.filter((b) => b.alive && b.team === team && b.progress >= 1);
      expect(done.length, `${team} buildings`).toBeGreaterThanOrEqual(3);
    }
    expect(w.units.filter((u) => u.alive).length, 'total pop').toBeGreaterThanOrEqual(TEAMS.length * BALANCE.npcMin);
    expect(kinds.raid ?? 0).toBeGreaterThan(0);
  });

  it('is deterministic for the same seed and commands', () => {
    const a = createSimulation(3), b = createSimulation(3);
    for (let i = 0; i < 2000; i++) {
      if (i === 50) for (const s of [a, b]) s.enqueue({ kind: 'join', viewerId: 'v1', name: 'Alice', team: 'red' });
      a.step(); b.step();
    }
    const strip = (s: typeof a) => ({ ...s.world, rng: s.world.rng.state() });
    expect(hashValue(strip(a))).toBe(hashValue(strip(b)));
    expect(hashValue(strip(createSimulation(4)))).not.toBe(hashValue(strip(createSimulation(3))));
  });

  it('a viewer joins once and can rejoin after dying', () => {
    const sim = createSimulation(1);
    const join = () => sim.enqueue({ kind: 'join', viewerId: 'v', name: 'Bob', team: 'blue' });
    join(); join(); sim.step();
    const mine = () => sim.world.units.filter((u) => u.viewerId === 'v');
    expect(mine()).toHaveLength(1);
    mine()[0].alive = false; mine()[0].respawnAt = sim.world.tick + 10;
    join(); sim.step();
    expect(mine()[0].alive).toBe(false);
    for (let i = 0; i < 10; i++) sim.step();
    join(); sim.step();
    expect(mine().filter((u) => u.alive)).toHaveLength(1);
  });

  it('runs play → storm → scoreboard → new world', () => {
    const sim = createSimulation(2);
    const r = sim.world.round;
    r.phaseUntil = sim.world.tick + 5;
    for (let i = 0; i < 6; i++) sim.step();
    expect(sim.world.round.phase).toBe('storm');
    sim.world.round.phaseUntil = sim.world.tick + 1;
    const ev = [sim.step(), sim.step()].flat();
    expect(ev.find((e) => e.kind === 'roundEnd')?.team).toBeDefined();
    expect(sim.world.round.phase).toBe('scoreboard');
    const seed = sim.world.seed;
    newRound(sim.world);
    expect(sim.world.seed).not.toBe(seed);
    expect(sim.world.round.phase).toBe('play');
    expect(sim.world.units.length).toBe(TEAMS.length * BALANCE.startNpcs);
  });
});
