import { expect, test } from 'vitest';
import { TEAMS } from '@godseed/shared';
import { generateTerrain, reachable } from '../worldgen/generate';
import { Deposit, Tile } from '../types';

test('50 seeds: four far-apart starts that all reach the centre, sane land share, ore in the centre', () => {
  for (let seed = 1; seed <= 50; seed++) {
    const t0 = performance.now();
    const t = generateTerrain(seed);
    expect(performance.now() - t0).toBeLessThan(50);
    const homes = TEAMS.map((team) => t.homes[team]);
    for (let a = 0; a < 4; a++) for (let b = a + 1; b < 4; b++) {
      expect(Math.hypot(homes[a].x - homes[b].x, homes[a].y - homes[b].y)).toBeGreaterThanOrEqual(28);
    }
    const reach = reachable(t.tiles, t.w, t.h, t.center.y * t.w + t.center.x);
    for (const h of homes) expect(reach[h.y * t.w + h.x]).toBe(1);
    const land = t.tiles.filter((x) => x !== Tile.Water && x !== Tile.DeepWater).length / t.tiles.length;
    expect(land).toBeGreaterThan(0.45);
    expect(land).toBeLessThan(0.75);
    let iron = 0, outside = 0;
    t.deposits.forEach((d, i) => {
      if (d !== Deposit.Iron && d !== Deposit.Gold) return;
      const x = i % t.w, y = (i - x) / t.w;
      if (Math.hypot(x - t.center.x, y - t.center.y) <= 8.5) { if (d === Deposit.Iron) iron++; } else outside++;
    });
    expect(iron).toBeGreaterThanOrEqual(6);
    expect(outside).toBe(0);
  }
});

test('same seed gives the same terrain', () => {
  expect(generateTerrain(9).tiles).toEqual(generateTerrain(9).tiles);
});
