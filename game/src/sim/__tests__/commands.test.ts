import { describe, expect, it } from 'vitest';
import { viewerUnit } from '../commands';
import { createSimulation, type SimCommand } from '../Simulation';

const setup = () => {
  const sim = createSimulation(9);
  const run = (cmd: SimCommand, ticks = 1) => { sim.enqueue(cmd); const ev = []; for (let i = 0; i < ticks; i++) ev.push(...sim.step()); return ev; };
  run({ kind: 'join', viewerId: 'a', name: 'Alice', team: 'red' });
  run({ kind: 'join', viewerId: 'b', name: 'Bob', team: 'blue' });
  return { sim, run, alice: () => viewerUnit(sim.world, 'a')!, bob: () => viewerUnit(sim.world, 'b')! };
};

describe('viewer commands', () => {
  it('join without a team picks a smallest team and a second join is refused', () => {
    const { run } = setup();
    const ev = run({ kind: 'join', viewerId: 'c', name: 'Cas' });
    expect(ev.find((e) => e.kind === 'join')?.team).toMatch(/yellow|green/);
    expect(run({ kind: 'join', viewerId: 'c', name: 'Cas' }).some((e) => e.kind === 'info' && e.text.includes('already'))).toBe(true);
  });

  it('orders change the job and stick after idling', () => {
    const { run, alice } = setup();
    run({ kind: 'order', viewerId: 'a', order: 'chop' }, 2);
    expect(alice().job).toMatchObject({ kind: 'gather', res: 'wood' });
    run({ kind: 'order', viewerId: 'a', order: 'march' }, 2);
    expect(alice().job.kind).toMatch(/guard|attack/);
    run({ kind: 'order', viewerId: 'a', order: 'pray' }, 2);
    expect(alice().job.kind).toBe('pray');
  });

  it('build places a building when the tribe can pay, otherwise explains', () => {
    const { sim, run, alice } = setup();
    run({ kind: 'build', viewerId: 'a', building: 'hut' });
    expect(alice().job.kind).toBe('build');
    sim.world.teams.red.stock.stone = 0;
    expect(run({ kind: 'build', viewerId: 'a', building: 'tower' }).some((e) => e.kind === 'info' && e.text.includes('needs'))).toBe(true);
  });

  it('two viewers who attack each other end with a named kill', () => {
    const { run, alice, bob } = setup();
    run({ kind: 'attackPlayer', viewerId: 'a', targetName: 'bob' });
    run({ kind: 'attackPlayer', viewerId: 'b', targetName: 'Alice' });
    expect(alice().job).toMatchObject({ kind: 'attack', targetId: bob().id });
    const ev = [];
    for (let i = 0; i < 1500 && alice().alive && bob().alive; i++) ev.push(...run({ kind: 'attackPlayer', viewerId: 'a', targetName: 'bob' }));
    expect(ev.some((e) => e.kind === 'kill' && /Alice \(red\)|Bob \(blue\)/.test(e.text))).toBe(true);
  });

  it('dead viewers wait 30 s before rejoining', () => {
    const { sim, run, alice } = setup();
    alice().alive = false;
    alice().respawnAt = sim.world.tick + 300;
    expect(run({ kind: 'join', viewerId: 'a', name: 'Alice' }).some((e) => e.text.includes('rejoin in'))).toBe(true);
    for (let i = 0; i < 300; i++) sim.step();
    run({ kind: 'join', viewerId: 'a', name: 'Alice' });
    expect(alice()).toMatchObject({ alive: true, team: 'red' });
  });

  it('burn sets fire to an enemy building', () => {
    const { sim, run, alice } = setup();
    for (let i = 0; i < 1500 && !sim.world.buildings.some((b) => b.team !== 'red' && b.alive && b.type !== 'wall'); i++) sim.step();
    run({ kind: 'burn', viewerId: 'a' });
    expect(alice().job).toMatchObject({ kind: 'attack', burn: true });
  });
});

describe('world vote', () => {
  it('opens every 5 minutes, counts the last ballot per viewer and applies the winner', () => {
    const sim = createSimulation(4);
    for (let i = 0; i < 3000; i++) sim.step();
    const v = sim.world.vote!;
    expect(v.options).toHaveLength(3);
    sim.enqueue({ kind: 'vote', viewerId: 'a', option: 1 });
    sim.enqueue({ kind: 'vote', viewerId: 'a', option: 2 });
    sim.enqueue({ kind: 'vote', viewerId: 'b', option: 2 });
    sim.step();
    expect(Object.values(sim.world.vote!.ballots)).toEqual([2, 2]);
    const ev = [];
    for (let i = 0; i < 600; i++) ev.push(...sim.step());
    expect(sim.world.vote).toBeUndefined();
    expect(ev.some((e) => e.text.startsWith('The people chose'))).toBe(true);
  });
});
