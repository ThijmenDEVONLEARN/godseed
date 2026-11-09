import { BALANCE } from '../config/balance';
import { Tile, type Team, type World } from './types';

export const idx = (w: number, x: number, y: number) => y * w + x;
export const inBounds = (world: World, x: number, y: number) => x >= 0 && y >= 0 && x < world.w && y < world.h;

/** Terrain only: water, deep water and mountains block, everything else can be walked. */
export function walkableTile(t: number): boolean {
  return t !== Tile.Water && t !== Tile.DeepWater && t !== Tile.Mountain;
}

export function isLand(t: number): boolean {
  return t !== Tile.Water && t !== Tile.DeepWater;
}

/** Ticks to step onto a tile; Infinity if blocked. Enemy walls cost a climb instead of blocking. */
export function stepCost(world: World, i: number, team: Team | undefined, walls: Map<number, Team>): number {
  const t = world.tiles[i];
  if (!walkableTile(t)) return Infinity;
  const wallTeam = walls.get(i);
  if (wallTeam !== undefined && wallTeam !== team) return BALANCE.moveTicks.wallClimb;
  if (t === Tile.Road || t === Tile.Bridge) return BALANCE.moveTicks.road;
  if (t === Tile.Forest) return BALANCE.moveTicks.forest;
  if (t === Tile.Hills) return BALANCE.moveTicks.hills;
  return BALANCE.moveTicks.default;
}

export const NEIGHBORS: readonly (readonly [number, number])[] = [[1, 0], [-1, 0], [0, 1], [0, -1]];

export function setTile(world: World, i: number, t: Tile): void {
  if (world.tiles[i] === t) return;
  world.tiles[i] = t;
  world.dirtyTiles.push(i);
}
