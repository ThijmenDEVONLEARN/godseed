import { describe, expect, it } from 'vitest';
import { clearSight, fit, frame, guard, type Shot, type Subject } from '../frame';

const lens = { fovDeg: 46, aspect: 9 / 16 };
const flat = () => 0;
const man: Subject = { x: 0, y: 1, z: 0, rx: 0.8, ry: 1.2 };

describe('framing rule', () => {
  it('a subject in the middle of a close shot fits', () => {
    expect(fit({ p: [0, 6, 10], l: [0, 1, 0] }, [man], lens)).toBeLessThanOrEqual(1);
  });

  it('a subject behind or beside the camera does not fit', () => {
    expect(fit({ p: [0, 6, 10], l: [0, 1, 0] }, [{ ...man, z: 20 }], lens)).toBe(9);
    expect(fit({ p: [0, 6, 10], l: [0, 1, 0] }, [{ ...man, x: 9 }], lens)).toBeGreaterThan(1);
  });

  it('the guard backs off until a tall giant and a wide dragon fit', () => {
    const titan: Subject = { x: 4, y: 6.5, z: 0, rx: 3.6, ry: 7 }, dragon: Subject = { x: -12, y: 12, z: 3, rx: 4.5, ry: 2.6 };
    const tight: Shot = { p: [0, 3, 8], l: [0, 1, 0] };
    for (const subjects of [[titan], [dragon], [titan, dragon, man]]) {
      expect(fit(tight, subjects, lens)).toBeGreaterThan(1);
      expect(fit(guard(tight, subjects, lens), subjects, lens)).toBeLessThanOrEqual(1);
    }
  });

  it('leaves a shot alone when everything already fits', () => {
    const s: Shot = { p: [0, 6, 10], l: [0, 1, 0] };
    expect(guard(s, [man], lens)).toBe(s);
  });

  it('looks over a hill from the same distance instead of moving away', () => {
    const s: Shot = { p: [0, 3, 20], l: [0, 1, 0] };
    const hill = (_x: number, z: number) => (z > 8 && z < 12 ? 9 : 0);
    const c = clearSight(s, hill);
    expect(c.p[1]).toBeGreaterThan(s.p[1]);
    expect(Math.hypot(c.p[0], c.p[1] - 1, c.p[2])).toBeCloseTo(Math.hypot(0, 2, 20), 3);
    expect(clearSight(s, flat)).toBe(s);
  });

  it('frame() ends with subjects inside the safe frame, hill or not', () => {
    const subjects = [man, { x: 6, y: 5, z: -3, rx: 3, ry: 5 }];
    const hill = (_x: number, z: number) => (z > 6 && z < 9 ? 7 : 0);
    expect(fit(frame({ p: [0, 2.5, 14], l: [0, 1, 0] }, subjects, lens, hill), subjects, lens)).toBeLessThanOrEqual(1);
  });
});
