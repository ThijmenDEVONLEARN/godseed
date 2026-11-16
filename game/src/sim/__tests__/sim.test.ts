import { TEAMS } from '@godseed/shared';
import { describe, expect, it } from 'vitest';
import { BALANCE } from '../../config/balance';
import { hashValue } from '../hash';
import { createSimulation } from '../Simulation';
import { walkableTile } from '../grid';
import { newRound, viewerScore } from '../systems/round';

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

  it('a villager does not keep chasing a sheep it cannot reach', () => {
    // Seed 7 has sheep across the water; one retry per tick gave 900+ of these in 1000 ticks.
    expect(run(7, 1000).kinds.noPath ?? 0).toBeLessThan(30);
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
    expect(sim.world.effects.some((e) => e.kind === 'tornado')).toBe(true); // the storm tornado
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

describe('viewer units', () => {
  it('get to work instead of standing still', () => {
    const sim = createSimulation(5);
    sim.enqueue({ kind: 'join', viewerId: 'w', name: 'Wim', team: 'green' });
    for (let i = 0; i < 100; i++) sim.step();
    const u = sim.world.units.find((x) => x.viewerId === 'w')!;
    expect(u.job.kind).not.toBe('idle');
    expect(u.x !== sim.world.teams.green.homeX || u.y !== sim.world.teams.green.homeY).toBe(true);
  });

  it('earn work points, twice as fast when they ordered the work', () => {
    const sim = createSimulation(5);
    for (const id of ['lazy', 'busy']) sim.enqueue({ kind: 'join', viewerId: id, name: id, team: 'green' });
    sim.step();
    sim.enqueue({ kind: 'order', viewerId: 'busy', order: 'farm' });
    for (let i = 0; i < 3000; i++) sim.step();
    const [lazy, busy] = ['lazy', 'busy'].map((id) => sim.world.units.find((u) => u.viewerId === id)!);
    expect(busy.work).toBeGreaterThanOrEqual(100);
    expect(busy.work).toBeGreaterThan(lazy.work);
    expect(viewerScore(busy)).toBe(3 * busy.kills + Math.floor(busy.work / 100) + (busy.alive ? 2 : 0));
  });

  it('puts up a statue of the best viewer in the next world, on tiles nobody can walk', () => {
    const sim = createSimulation(3);
    for (const [id, name] of [['a', 'Ann'], ['b', 'Bob']]) sim.enqueue({ kind: 'join', viewerId: id, name, team: 'red' });
    sim.step();
    sim.world.units.find((u) => u.viewerId === 'b')!.kills = 4;
    sim.world.round.phase = 'storm';
    sim.world.round.phaseUntil = sim.world.tick + 1;
    sim.step(); sim.step();
    expect(sim.world.round.mvp).toMatchObject({ viewerId: 'b', name: 'Bob', team: 'red' });
    newRound(sim.world);
    const st = sim.world.statue!;
    expect(st).toMatchObject({ viewerId: 'b', name: 'Bob' });
    for (const [dx, dy] of [[0, 0], [1, 0], [0, 1], [1, 1]]) expect(walkableTile(sim.world.tiles[(st.y + dy) * sim.world.w + st.x + dx])).toBe(false);
    newRound(sim.world);
    expect(sim.world.statue).toBeUndefined(); // nobody played that round
  });
});
