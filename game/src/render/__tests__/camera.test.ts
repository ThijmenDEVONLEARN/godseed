import { TEAMS } from '@godseed/shared';
import { describe, expect, it } from 'vitest';
import { createSimulation } from '../../sim/Simulation';
import type { SimEvent } from '../../sim/types';
import { createCamera } from '../Camera';

const world = createSimulation(1).world;
const ev = (kind: SimEvent['kind'], x: number, y: number): SimEvent => ({ tick: 0, kind, text: '', x, y });

describe('camera rules', () => {
  it('a join does not pull the camera away from a fight', () => {
    const cam = createCamera(64, 72);
    cam.events([ev('kill', 30, 30)], 0);
    cam.events([ev('join', 10, 10)], 100);
    cam.update(world, 200, 16);
    expect(cam.prio).toBe('Event');
  });

  it('a gift takes the camera from a fight and holds until the end plus 12 s', () => {
    const cam = createCamera(64, 72);
    cam.events([ev('kill', 30, 30)], 0);
    cam.gift(50, 50, 5000, 1000);
    cam.events([ev('kill', 30, 30)], 2000);
    cam.update(world, 17_900, 16);
    expect(cam.prio).toBe('Gift');
    cam.update(world, 18_100, 16);
    expect(cam.prio).not.toBe('Gift');
  });

  it('a gift storm keeps up: newest gifts shown 5 s each, older ones skipped', () => {
    const cam = createCamera(64, 72);
    for (let i = 0; i < 5; i++) cam.gift(10 + i, 10, 30_000, i * 100);
    cam.update(world, 600, 16);
    cam.update(world, 5_200, 16); // first gift had 5 s, the next waiting one (oldest kept) takes over
    cam.update(world, 10_400, 16);
    cam.update(world, 15_600, 16); // queue empty: last gift holds its (capped) effect time plus 12 s
    expect(cam.prio).toBe('Gift');
    cam.update(world, 10_400 + 15_000 + 12_000 + 100, 16);
    expect(cam.prio).not.toBe('Gift');
  });

  it('a join zooms for 3 s when nothing happens, but not during join spam', () => {
    const cam = createCamera(64, 72);
    cam.events([ev('join', 10, 10)], 0);
    cam.update(world, 100, 16);
    expect(cam.prio).toBe('Join');
    cam.update(world, 3100, 16);
    expect(cam.prio).toBe('None');
    const spam = createCamera(64, 72);
    spam.events(Array.from({ length: 6 }, () => ev('join', 10, 10)), 0);
    spam.events([ev('join', 20, 20)], 4000);
    spam.update(world, 4100, 16);
    expect(spam.prio).toBe('None');
  });

  it('tours a village after 20 quiet seconds when nobody has joined', () => {
    const cam = createCamera(64, 72);
    cam.update(world, 19_000, 16);
    expect(cam.prio).toBe('None');
    cam.update(world, 21_000, 16);
    expect(cam.prio).toBe('Tour');
  });
});

describe('director (R3)', () => {
  const withViewers = (n: number) => {
    const sim = createSimulation(2);
    for (let i = 0; i < n; i++) sim.enqueue({ kind: 'join', viewerId: `v${i}`, name: `V${i}`, team: TEAMS[i % 4] });
    sim.step();
    return sim.world;
  };

  it('small gifts and a second gift from the same giver within a minute get no shot', () => {
    const cam = createCamera(80, 90);
    cam.gift(10, 10, 5000, 0, undefined, { by: 'a', coins: 5 });
    cam.update(world, 100, 16);
    expect(cam.prio).toBe('None');
    cam.gift(10, 10, 1000, 200, undefined, { by: 'a', coins: 50 });
    cam.update(world, 300, 16);
    expect(cam.prio).toBe('Gift');
    cam.update(world, 13_500, 16); // first shot over
    cam.gift(20, 20, 1000, 14_000, undefined, { by: 'a', coins: 500 });
    cam.update(world, 14_100, 16);
    expect(cam.prio).not.toBe('Gift');
    cam.gift(20, 20, 1000, 61_000, undefined, { by: 'a', coins: 500 });
    cam.update(world, 61_100, 16);
    expect(cam.prio).toBe('Gift');
  });

  it('the biggest waiting gift goes first', () => {
    const cam = createCamera(80, 90);
    cam.gift(1, 1, 30_000, 0, undefined, { by: 'a', coins: 20 });
    cam.gift(2, 2, 30_000, 10, undefined, { by: 'b', coins: 50 });
    cam.gift(3, 3, 30_000, 20, undefined, { by: 'c', coins: 500 });
    cam.update(world, 5_100, 16);
    expect(cam.focus).toMatchObject({ x: 3, y: 3 });
  });

  it('a fight is followed at most 15 s', () => {
    const cam = createCamera(80, 90);
    for (let t = 0; t <= 30_000; t += 1000) { cam.events([ev('kill', 30, 30)], t); cam.update(world, t, 16); }
    expect(cam.prio).not.toBe('Event');
  });

  it('a command puts the viewer on screen, at most 3 wait and each viewer once a minute', () => {
    const w = withViewers(6);
    const cam = createCamera(80, 90);
    const unit = (i: number) => w.units.find((u) => u.viewerId === `v${i}`)!.id;
    for (let i = 0; i < 6; i++) cam.command(unit(i), `v${i}`, 0);
    const seen: string[] = [];
    for (let t = 0; t < 15_000; t += 100) { cam.update(w, t, 16); const v = cam.viewer; if (v && cam.prio === 'Command' && seen.at(-1) !== v) seen.push(v); }
    expect(seen).toEqual(['v0', 'v1', 'v2', 'v3']);
    cam.command(unit(0), 'v0', 20_000);
    cam.update(w, 20_100, 16);
    expect(cam.prio).not.toBe('Command');
  });

  it('a quiet camera spotlights every viewer once before anyone twice, and the overview never lasts 20 s', () => {
    const w = withViewers(4);
    const cam = createCamera(80, 90);
    const spots: string[] = [];
    let overviewSince = 0, longest = 0;
    for (let t = 0; t < 140_000; t += 100) {
      cam.update(w, t, 16);
      if (cam.prio === 'None') longest = Math.max(longest, t - overviewSince); else overviewSince = t;
      if (cam.prio === 'Spotlight' && spots.at(-1) !== cam.viewer) spots.push(cam.viewer!);
    }
    expect(new Set(spots.slice(0, 4)).size).toBe(4);
    expect(spots[4]).toBe(spots[0]);
    expect(longest).toBeLessThanOrEqual(20_100);
  });
});

describe('camera follow', () => {
  it('follows the joined unit as it walks', () => {
    const sim = createSimulation(6);
    sim.enqueue({ kind: 'join', viewerId: 'v', name: 'Vera', team: 'red' });
    const cam = createCamera(64, 72);
    cam.events(sim.step(), 0);
    const u = sim.world.units.find((x) => x.viewerId === 'v')!;
    u.x += 5;
    let c = cam.update(sim.world, 16, 16);
    for (let t = 32; t < 2000; t += 16) c = cam.update(sim.world, t, 16);
    expect(Math.round(c.x)).toBe(u.x);
  });
});
