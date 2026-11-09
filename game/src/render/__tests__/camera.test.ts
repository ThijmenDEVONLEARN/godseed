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

  it('tours a team after a quiet minute', () => {
    const cam = createCamera(64, 72);
    cam.update(world, 61_000, 16);
    expect(cam.prio).toBe('Tour');
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
