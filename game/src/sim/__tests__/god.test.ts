import { TEAMS } from '@godseed/shared';
import { describe, expect, it } from 'vitest';
import { GIFTS, type GodEffect } from '../../config/gifts';
import { reachable } from '../worldgen/generate';
import { applyGod, giftEffect } from '../god';
import { createSimulation } from '../Simulation';

const grown = () => {
  const sim = createSimulation(7);
  for (let i = 0; i < 2500; i++) sim.step();
  sim.enqueue({ kind: 'join', viewerId: 'g', name: 'Gina', team: 'red' });
  sim.step();
  return sim;
};
const all: GodEffect[] = [...GIFTS.tiers.flatMap((t) => t.effects), 'rain', 'baby', 'goldChest'];

describe('gift mapping', () => {
  it('maps coins to tiers, 199 to chief, and overrides win', () => {
    const w = createSimulation(1).world;
    const tierOf = (c: number) => GIFTS.tiers.findIndex((t) => t.effects.includes(giftEffect(w, c, 0) as GodEffect));
    expect([1, 4, 5, 19, 20, 49, 50, 198, 200, 499, 500, 5000].map(tierOf)).toEqual([0, 0, 1, 1, 2, 2, 3, 3, 4, 4, 5, 5]);
    expect(giftEffect(w, 199, 0)).toBe('leader');
    GIFTS.giftOverrides[42] = 'dragon';
    expect(giftEffect(w, 1, 42)).toBe('dragon');
    delete GIFTS.giftOverrides[42];
  });
});

describe('god effects', () => {
  for (const effect of all) {
    it(`${effect} runs, says what happened and keeps the world playable`, () => {
      const sim = grown();
      const u = sim.world.units.find((x) => x.viewerId === 'g')!;
      sim.world.events = [];
      applyGod(sim.world, effect, 'red', 'Gina', u);
      expect(sim.world.events.some((e) => e.kind === 'god')).toBe(true);
      for (let i = 0; i < 400; i++) sim.step();
      const w = sim.world, seen = reachable(w.tiles, w.w, w.h, w.teams.red.homeY * w.w + w.teams.red.homeX);
      for (const t of TEAMS) expect(seen[w.teams[t].homeY * w.w + w.teams[t].homeX], `${t} reachable`).toBe(1);
    });
  }

  it('meteor wrecks the strongest enemy village', () => {
    const sim = grown();
    const w = sim.world;
    w.teams.blue.score = 999;
    const hpBefore = w.buildings.filter((b) => b.alive && b.team === 'blue').reduce((s, b) => s + b.hp, 0);
    applyGod(w, 'meteor', 'red', 'Gina');
    const hpAfter = w.buildings.filter((b) => b.alive && b.team === 'blue').reduce((s, b) => s + b.hp, 0);
    expect(hpAfter).toBeLessThan(hpBefore);
  });

  it('hero fights for the giver and leaves after its time', () => {
    const sim = grown();
    applyGod(sim.world, 'hero', 'red', 'Gina');
    const hero = sim.world.units.find((u) => u.role === 'hero')!;
    expect(hero.name).toBe('Gina the Hero');
    for (let i = 0; i < 1900; i++) sim.step();
    expect(hero.alive).toBe(false);
  });

  it('rain puts out fires and follow adds a villager', () => {
    const sim = grown();
    const w = sim.world;
    const b = w.buildings.find((x) => x.alive && x.type !== 'wall')!;
    b.burning = true;
    const pop = w.units.filter((u) => u.alive && u.team === 'red').length;
    applyGod(w, 'rain', 'red');
    applyGod(w, 'baby', 'red');
    sim.step();
    expect(b.burning).toBe(false);
    expect(w.units.filter((u) => u.alive && u.team === 'red').length).toBeGreaterThan(pop);
  });
});

describe('chief', () => {
  it('199 coins makes the giver chief, the next payer takes over', () => {
    const sim = grown();
    sim.enqueue({ kind: 'gift', viewerId: 'g', name: 'Gina', coins: 199, giftId: 0 });
    sim.step();
    const gina = sim.world.units.find((u) => u.viewerId === 'g')!;
    expect(gina.role).toBe('leader');
    sim.enqueue({ kind: 'join', viewerId: 'h', name: 'Hank', team: 'red' });
    sim.step();
    sim.enqueue({ kind: 'gift', viewerId: 'h', name: 'Hank', coins: 199, giftId: 0 });
    sim.step();
    expect(gina.role).toBe('viewer');
    expect(sim.world.leaders.red).toBe(sim.world.units.find((u) => u.viewerId === 'h')!.id);
  });

  it('only the chief can declare war', () => {
    const sim = grown();
    sim.enqueue({ kind: 'leaderCmd', viewerId: 'g', cmd: 'war', team: 'blue' });
    expect(sim.step().some((e) => e.text.includes('only the chief'))).toBe(true);
    sim.enqueue({ kind: 'gift', viewerId: 'g', name: 'Gina', coins: 199, giftId: 0 });
    sim.step();
    sim.enqueue({ kind: 'leaderCmd', viewerId: 'g', cmd: 'war', team: 'blue' });
    sim.step();
    expect(sim.world.teams.red.atWarWith).toEqual(['blue']);
  });

  it('peace is mutual and calls back fighters on both sides', () => {
    const sim = grown();
    sim.enqueue({ kind: 'gift', viewerId: 'g', name: 'Gina', coins: 199, giftId: 0 });
    sim.step();
    const w = sim.world;
    w.teams.blue.atWarWith = ['red'];
    const blue = w.units.find((u) => u.alive && u.team === 'blue')!;
    const redTarget = w.units.find((u) => u.alive && u.team === 'red')!;
    blue.job = { kind: 'attack', team: 'red', targetId: redTarget.id, targetIsUnit: true };
    sim.enqueue({ kind: 'leaderCmd', viewerId: 'g', cmd: 'peace', team: 'blue' });
    sim.step();
    expect(w.teams.blue.atWarWith).toEqual([]);
    expect(blue.job.kind).not.toBe('attack');
  });

  it('!tax has a 2 minute cooldown', () => {
    const sim = grown();
    sim.enqueue({ kind: 'gift', viewerId: 'g', name: 'Gina', coins: 199, giftId: 0 });
    sim.step();
    sim.world.teams.red.stock.food = 100;
    sim.enqueue({ kind: 'leaderCmd', viewerId: 'g', cmd: 'tax' });
    sim.step();
    sim.enqueue({ kind: 'leaderCmd', viewerId: 'g', cmd: 'tax' });
    expect(sim.step().some((e) => e.text.includes('taxed recently'))).toBe(true);
  });
});

describe('survived disasters (A8)', () => {
  it('a tribe that still has a building after a disaster scores it', () => {
    const sim = grown();
    const before = sim.world.teams.blue.disastersSurvived;
    applyGod(sim.world, 'plague', 'red', 'Gina');
    const plague = sim.world.effects.find((e) => e.kind === 'plague')!;
    plague.until = sim.world.tick + 1;
    const ev = [sim.step(), sim.step()].flat();
    expect(sim.world.teams[plague.team].disastersSurvived).toBe(plague.team === 'blue' ? before + 1 : 1);
    expect(ev.some((e) => e.text.includes('survived the plague'))).toBe(true);
  });

  it('the plague hits units with odd and even ids', () => {
    const sim = grown();
    applyGod(sim.world, 'plague', 'red', 'Gina');
    const team = sim.world.effects.find((e) => e.kind === 'plague')!.team;
    const hp = () => Object.fromEntries(sim.world.units.filter((u) => u.alive && u.team === team).map((u) => [u.id, u.hp]));
    const before = hp();
    for (let i = 0; i < 25; i++) sim.step();
    const after = hp();
    const hurt = Object.keys(before).filter((id) => (after[+id] ?? 0) < before[+id]).map(Number);
    expect(hurt.some((id) => id % 2 === 0)).toBe(true);
    expect(hurt.some((id) => id % 2 === 1)).toBe(true);
  });
});
