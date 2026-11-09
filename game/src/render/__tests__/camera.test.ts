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
