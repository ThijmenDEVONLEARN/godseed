import { BALANCE } from '../../config/balance';
import { buildingsOf, dist, emit, spawnBuilding } from '../entities';
import { idx, inBounds, isLand, setTile } from '../grid';
import { Deposit, Tile, type Building, type BuildingType, type Resource, type Team, type World } from '../types';

export function canAfford(world: World, team: Team, type: BuildingType, times = 1): boolean {
  const stock = world.teams[team].stock;
  return Object.entries(BALANCE.costs[type]).every(([r, n]) => stock[r as Resource] >= (n ?? 0) * times);
}

function pay(world: World, team: Team, type: BuildingType): void {
  for (const [r, n] of Object.entries(BALANCE.costs[type])) world.teams[team].stock[r as Resource] -= n ?? 0;
}

function free(world: World, x: number, y: number, spacing: number): boolean {
  if (!inBounds(world, x, y)) return false;
  const i = idx(world.w, x, y), t = world.tiles[i];
  if ((t !== Tile.Grass && t !== Tile.Sand && t !== Tile.Burnt && t !== Tile.Ruins) || world.deposits[i] !== Deposit.None) return false;
  return !world.buildings.some((b) => b.alive && Math.max(Math.abs(b.x - x), Math.abs(b.y - y)) <= spacing);
}

/** Direction (unit vector) from home towards the nearest other team. */
function threatDir(world: World, team: Team): [number, number] {
  const me = world.teams[team];
  let best: [number, number] = [0, 1], bd = Infinity;
  for (const t of Object.values(world.teams)) {
    if (t.team === team) continue;
    const d = Math.hypot(t.homeX - me.homeX, t.homeY - me.homeY);
    if (d < bd) { bd = d; best = [(t.homeX - me.homeX) / d, (t.homeY - me.homeY) / d]; }
  }
  return best;
}

/** Ring positions around home, sorted by angle closeness to a direction (ties by index). */
function ring(world: World, team: Team, r: number, dir?: [number, number]): [number, number][] {
  const { homeX: hx, homeY: hy } = world.teams[team];
  const out: [number, number, number][] = [];
  for (let y = hy - r - 1; y <= hy + r + 1; y++) for (let x = hx - r - 1; x <= hx + r + 1; x++) {
    const d = Math.hypot(x - hx, y - hy);
    if (Math.abs(d - r) > 0.5) continue;
    const score = dir ? -((x - hx) * dir[0] + (y - hy) * dir[1]) / d : d;
    out.push([x, y, score]);
  }
  return out.sort((a, b) => a[2] - b[2] || a[1] - b[1] || a[0] - b[0]).map(([x, y]) => [x, y]);
}

/**
 * Pays for and places a building near home. Walls place a run of segments facing the nearest enemy.
 * Returns the placed buildings (empty when unaffordable or no room).
 */
export function placeBuilding(world: World, team: Team, type: BuildingType): Building[] {
  if (!canAfford(world, team, type)) return [];
  const t = world.teams[team];
  const placed: Building[] = [];
  const put = (x: number, y: number) => { pay(world, team, type); const b = spawnBuilding(world, team, type, x, y); placed.push(b); return b; };

  if (type === 'wall') {
    for (const [x, y] of ring(world, team, 7, threatDir(world, team))) {
      if (placed.length >= 6 || !canAfford(world, team, 'wall')) break;
      if (free(world, x, y, 0) && !world.buildings.some((b) => b.alive && b.x === x && b.y === y)) put(x, y);
    }
  } else if (type === 'tower') {
    const spot = ring(world, team, 5, threatDir(world, team)).find(([x, y]) => free(world, x, y, 1));
    if (spot) put(...spot);
  } else if (type === 'bridge') {
    let best: [number, number] | undefined, bd = Infinity;
    for (let y = t.homeY - 14; y <= t.homeY + 14; y++) for (let x = t.homeX - 14; x <= t.homeX + 14; x++) {
      if (!inBounds(world, x, y) || world.tiles[idx(world.w, x, y)] !== Tile.Water) continue;
      const land = (dx: number, dy: number) => inBounds(world, x + dx, y + dy) && isLand(world.tiles[idx(world.w, x + dx, y + dy)]) && world.tiles[idx(world.w, x + dx, y + dy)] !== Tile.Bridge;
      if (!((land(1, 0) && land(-1, 0)) || (land(0, 1) && land(0, -1)))) continue;
      const d = Math.abs(x - t.homeX) + Math.abs(y - t.homeY);
      if (d < bd) { bd = d; best = [x, y]; }
    }
    if (best) put(...best);
  } else {
    for (let r = 2; r <= 9 && !placed.length; r++) {
      for (const [x, y] of ring(world, team, r)) {
        const roomy = type !== 'farm' || [-1, 0, 1].every((dy) => [-1, 0, 1].every((dx) => free(world, x + dx, y + dy, 0)));
        if (roomy && free(world, x, y, type === 'farm' ? 2 : 1)) {
          put(x, y);
          if (type === 'farm') for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) setTile(world, idx(world.w, x + dx, y + dy), Tile.Farmland);
          break;
        }
      }
    }
  }
  if (placed.length) emit(world, { kind: 'build', team, text: `${team[0].toUpperCase() + team.slice(1)} started a ${type}`, x: placed[0].x, y: placed[0].y });
  return placed;
}

/** Called when progress reaches 1. */
export function completeBuilding(world: World, b: Building): void {
  b.progress = 1;
  if (b.type === 'bridge') setTile(world, b.y * world.w + b.x, Tile.Bridge);
  if (b.type !== 'wall') emit(world, { kind: 'built', team: b.team, text: `${b.team[0].toUpperCase() + b.team.slice(1)} built a ${b.type}`, x: b.x, y: b.y });
}

export function popCap(world: World, team: Team): number {
  const huts = buildingsOf(world, team, 'hut').filter((b) => b.progress >= 1).length;
  return Math.min(BALANCE.popCap, BALANCE.popBase + huts * BALANCE.popPerHut);
}

/** Nearest unfinished building of a team, for builders. */
export function nextConstruction(world: World, team: Team, from: { x: number; y: number }): Building | undefined {
  let best: Building | undefined;
  for (const b of world.buildings) if (b.alive && b.team === team && b.progress < 1 && (!best || dist(b, from) < dist(best, from))) best = b;
  return best;
}
