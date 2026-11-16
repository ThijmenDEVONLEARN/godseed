import { cleanName } from '@godseed/shared';
import { describe, expect, it } from 'vitest';
import { createSimulation } from '../../sim/Simulation';
import { createCommandRouter } from '..';
import { BALANCE } from '../../config/balance';
import { clock } from '../../ui/Hud';
import { createCooldown } from '../cooldown';
import { parseChat } from '../parser';

const world = createSimulation(1).world;
const v = { id: 'id1', name: 'Alice' };
const p = (t: string) => parseChat(t, v, world);

describe('parseChat', () => {
  it('parses every command', () => {
    expect(p('!join')).toEqual({ sim: { kind: 'join', viewerId: 'id1', name: 'Alice', team: undefined } });
    expect(p('!JOIN Red')).toMatchObject({ sim: { team: 'red' } });
    expect(p('!build hut')).toMatchObject({ sim: { kind: 'build', building: 'hut' } });
    expect(p('!attack blue')).toMatchObject({ sim: { kind: 'attackTeam', team: 'blue' } });
    expect(p('!attack @Bob_2')).toMatchObject({ sim: { kind: 'attackPlayer', targetName: 'Bob_2' } });
    for (const o of ['chop', 'mine', 'farm', 'defend', 'march', 'pray']) expect(p(`!${o}`)).toMatchObject({ sim: { kind: 'order', order: o } });
    expect(p('!burn')).toMatchObject({ sim: { kind: 'burn' } });
    expect(p('!me')).toEqual({ ui: 'me' });
    expect(p('!help')).toEqual({ ui: 'help' });
    expect(p('!rename Kees')).toMatchObject({ sim: { kind: 'rename', name: 'Kees' } });
    expect(p('!vote 2')).toEqual({ vote: 2 });
  });

  it('explains bad input and ignores plain chat', () => {
    expect(p('hello there')).toBeNull();
    for (const t of ['!join purple', '!build castle', '!attack', '!vote 7', '!dance', '!rename', '!chop wood']) expect(p(t)).toHaveProperty('error');
  });

  it('keeps names unique among players', () => {
    const sim = createSimulation(2);
    sim.enqueue({ kind: 'join', viewerId: 'x', name: 'Alice' });
    sim.step();
    expect(parseChat('!join', v, sim.world)).toMatchObject({ sim: { name: 'Alice_2' } });
  });
});

describe('cleanName', () => {
  it('filters names for the stream', () => {
    expect(cleanName('Ålice 💖 the great one!!', 'u7')).toBe('licethegreatone');
    expect(cleanName('fuckface', 'user1234')).toBe('Villager1234');
    expect(cleanName('🔥🔥', 'abc')).toBe('Villagerabc');
  });
});

describe('cooldown', () => {
  it('allows one command per 10 s per viewer', () => {
    const cd = createCooldown();
    expect(cd('a', 0)).toBe(0);
    expect(cd('a', 4000)).toBe(6);
    expect(cd('b', 4000)).toBe(0);
    expect(cd('a', 10_000)).toBe(0);
  });
});

describe('!help and the round clock', () => {
  it('shows the help popup at most once a minute, however many viewers ask', () => {
    let shown = 0;
    const route = createCommandRouter(createSimulation(1), { feed() {}, say() {}, highlight() {}, vote() {}, likes() {}, help: () => shown++ });
    const ask = (i: number, now: number) => route({ type: 'chat', viewer: { id: `v${i}`, name: `V${i}` }, text: '!help', ts: now }, now);
    for (let i = 0; i < 5; i++) ask(i, 1000 + i * 5000);
    expect(shown).toBe(1);
    ask(9, 61_000);
    expect(shown).toBe(2);
  });

  it('a round lasts 30 minutes and the clock reads mm:ss', () => {
    expect(BALANCE.round.roundTicks / BALANCE.ticksPerSecond).toBe(30 * 60);
    expect(BALANCE.round.stormTicks / BALANCE.ticksPerSecond).toBe(3 * 60);
    expect(clock(BALANCE.round.roundTicks)).toBe('30:00');
    expect(clock(95)).toBe('00:10');
  });
});
