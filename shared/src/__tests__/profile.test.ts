import { describe, expect, it } from 'vitest';
import { levelOf, roundXp, tierOf } from '../profile';

describe('XP and levels', () => {
  it('adds the bonuses and caps a round at 100 XP', () => {
    expect(roundXp({ score: 8, commanded: true }, true)).toBe(23);
    expect(roundXp({ score: 8, commanded: false }, false)).toBe(8);
    expect(roundXp({ score: 500, commanded: true }, true)).toBe(100);
    expect(roundXp({ score: -3, commanded: false }, false)).toBe(0);
  });

  it('levels at 320, 1620 and 7220 XP', () => {
    expect(levelOf(0)).toBe(1);
    expect(levelOf(319)).toBe(4);
    expect(levelOf(320)).toBe(5);
    expect(levelOf(1619)).toBe(9);
    expect(levelOf(1620)).toBe(10);
    expect(levelOf(7220)).toBe(20);
    expect([1, 4, 5, 9, 10, 19, 20].map(tierOf)).toEqual([0, 0, 1, 1, 2, 2, 3]);
  });
});
