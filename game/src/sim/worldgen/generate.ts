import { TEAMS, type Team } from '@godseed/shared';
import { BALANCE } from '../../config/balance';
import { createRng } from '../rng';
import { idx, isLand, walkableTile, NEIGHBORS } from '../grid';
import { createNoise } from './noise';
import { Deposit, Tile, type TeamState, type World } from '../types';

export const START_QUADRANT: Record<Team, { x0: number; x1: number; y0: number; y1: number }> = {
  red: { x0: 10, x1: 18, y0: 10, y1: 22 },
  blue: { x0: 46, x1: 54, y0: 10, y1: 22 },
  yellow: { x0: 10, x1: 18, y0: 50, y1: 62 },
  green: { x0: 46, x1: 54, y0: 50, y1: 62 },
};

export interface Terrain {
  seed: number;
  w: number;
  h: number;
  tiles: Uint8Array;
  deposits: Uint8Array;
  depositAmount: Uint8Array;
  homes: Record<Team, { x: number; y: number }>;
  center: { x: number; y: number };
}

/** Builds a continent with four separated start areas and a contested centre. Retries with seed+1 until valid. */
export function generateTerrain(seed: number, w = BALANCE.map.w, h = BALANCE.map.h): Terrain {
  for (let attempt = 0; attempt < 20; attempt++) {
    const t = tryGenerate(seed + attempt, w, h);
    if (t) return t;
  }
  throw new Error(`no valid world for seed ${seed}`);
}

function tryGenerate(seed: number, w: number, h: number): Terrain | null {
  const rng = createRng(seed);
  const height = createNoise(rng, w, h, 3, 16);
  const moist = createNoise(rng, w, h, 2, 12);
  const tiles = new Uint8Array(w * h), deposits = new Uint8Array(w * h), amount = new Uint8Array(w * h);
  const cx = Math.floor(w / 2), cy = Math.floor(h / 2);

  // 1-2. height with a radial falloff so the edges are sea, then terrain by height and moisture
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const dx = (x - (w - 1) / 2) / (w / 2), dy = (y - (h - 1) / 2) / (h / 2);
    const v = height(x, y) * 0.8 + 0.55 - Math.sqrt(dx * dx + dy * dy) * 0.7;
    const m = moist(x, y);
    let t: Tile = v < 0.25 ? Tile.DeepWater : v < 0.35 ? Tile.Water : v < 0.39 ? Tile.Sand : Tile.Grass;
    if (t === Tile.Grass) t = v > 0.86 ? Tile.Mountain : v > 0.74 ? Tile.Hills : m > 0.6 ? Tile.Forest : Tile.Grass;
    tiles[idx(w, x, y)] = t;
  }
  const set = (x: number, y: number, t: Tile) => { if (x >= 0 && y >= 0 && x < w && y < h) tiles[idx(w, x, y)] = t; };
  const disc = (x0: number, y0: number, r: number, f: (x: number, y: number) => void) => {
    for (let y = y0 - r; y <= y0 + r; y++) for (let x = x0 - r; x <= x0 + r; x++) if ((x - x0) ** 2 + (y - y0) ** 2 <= r * r && x >= 0 && y >= 0 && x < w && y < h) f(x, y);
  };

  // 3. start spots: the most land-rich spot in each quadrant, then cleared to grass
  const homes = {} as Record<Team, { x: number; y: number }>;
  for (const team of TEAMS) {
    const q = START_QUADRANT[team];
    let best = { x: q.x0, y: q.y0, s: -1 };
    for (let y = q.y0; y <= q.y1; y++) for (let x = q.x0; x <= q.x1; x++) {
      let s = 0;
      for (let yy = y - 3; yy <= y + 3; yy++) for (let xx = x - 3; xx <= x + 3; xx++) {
        const t = tiles[idx(w, xx, yy)];
        s += t === Tile.Grass ? 2 : walkableTile(t) ? 1 : 0;
      }
      if (s > best.s) best = { x, y, s };
    }
    homes[team] = { x: best.x, y: best.y };
    disc(best.x, best.y, 4, (x, y) => set(x, y, Tile.Grass));
    disc(best.x, best.y, 7, (x, y) => { if (!isLand(tiles[idx(w, x, y)])) set(x, y, Tile.Sand); });
  }

  // 4. barriers: a river north-south through the middle with two fords, a forest/hill band east-west with two gaps
  const fordY = [Math.floor(h * 0.28), Math.floor(h * 0.72)];
  for (let y = 0; y < h; y++) {
    const rx = cx + Math.round(Math.sin(y / 6 + seed) * 2) - 1;
    for (const x of [rx, rx + 1]) {
      if (!isLand(tiles[idx(w, x, y)]) && tiles[idx(w, x, y)] === Tile.DeepWater) continue;
      set(x, y, fordY.some((f) => Math.abs(f - y) <= 0) ? Tile.Sand : Tile.Water);
    }
  }
  const gapX = [Math.floor(w * 0.22), Math.floor(w * 0.78)];
  for (let x = 0; x < w; x++) for (let y = cy - 2; y <= cy + 1; y++) {
    const i = idx(w, x, y);
    if (!isLand(tiles[i]) || Math.abs(x - cx) < 9) continue;
    if (gapX.some((g) => Math.abs(g - x) <= 1)) { set(x, y, Tile.Grass); continue; }
    set(x, y, (x + y) % 3 === 0 ? Tile.Hills : Tile.Forest);
  }

  // 5. centre: open ground with the only iron and gold
  disc(cx, cy, 8, (x, y) => { const t = tiles[idx(w, x, y)]; if (t !== Tile.Water && t !== Tile.Sand) set(x, y, rng.chance(0.25) ? Tile.Hills : Tile.Grass); });
  const ore = (kind: Deposit, n: number) => {
    for (let placed = 0, tries = 0; placed < n && tries < 400; tries++) {
      const a = rng.next() * Math.PI * 2, r = 2 + rng.next() * 6;
      const x = Math.round(cx + Math.cos(a) * r), y = Math.round(cy + Math.sin(a) * r), i = idx(w, x, y);
      if (walkableTile(tiles[i]) && tiles[i] !== Tile.Water && deposits[i] === Deposit.None) { deposits[i] = kind; amount[i] = kind === Deposit.Iron ? BALANCE.depositAmount.iron : BALANCE.depositAmount.gold; placed++; }
    }
  };
  ore(Deposit.Iron, 6 + rng.int(5));
  ore(Deposit.Gold, 3 + rng.int(3));

  // trees on forest, stone on hills, with a guaranteed minimum around each start
  for (let i = 0; i < w * h; i++) {
    if (deposits[i]) continue;
    if (tiles[i] === Tile.Forest) { deposits[i] = Deposit.Tree; amount[i] = BALANCE.depositAmount.tree; }
    else if (tiles[i] === Tile.Hills && rng.chance(0.5)) { deposits[i] = Deposit.Stone; amount[i] = BALANCE.depositAmount.stone; }
  }
  for (const team of TEAMS) {
    const { x: hx, y: hy } = homes[team];
    const count = (d: Deposit) => { let n = 0; disc(hx, hy, 9, (x, y) => { if (deposits[idx(w, x, y)] === d) n++; }); return n; };
    const add = (d: Deposit, tile: Tile, need: number) => {
      for (let tries = 0; count(d) < need && tries < 500; tries++) {
        const a = rng.next() * Math.PI * 2, r = 5 + rng.next() * 4;
        const x = Math.round(hx + Math.cos(a) * r), y = Math.round(hy + Math.sin(a) * r), i = idx(w, x, y);
        if (x < 0 || y < 0 || x >= w || y >= h || tiles[i] !== Tile.Grass || deposits[i]) continue;
        tiles[i] = tile; deposits[i] = d; amount[i] = d === Deposit.Tree ? BALANCE.depositAmount.tree : BALANCE.depositAmount.stone;
      }
    };
    add(Deposit.Tree, Tile.Forest, 12);
    add(Deposit.Stone, Tile.Hills, 6);
  }

  // 6. every start must reach the centre over land
  const reach = reachable(tiles, w, h, idx(w, cx, cy));
  if (TEAMS.some((t) => !reach[idx(w, homes[t].x, homes[t].y)])) return null;
  return { seed, w, h, tiles, deposits, depositAmount: amount, homes, center: { x: cx, y: cy } };
}

/** BFS over walkable tiles from one tile. */
export function reachable(tiles: Uint8Array, w: number, h: number, from: number): Uint8Array {
  const seen = new Uint8Array(w * h), queue = [from];
  seen[from] = 1;
  for (let q = 0; q < queue.length; q++) {
    const i = queue[q], x = i % w, y = (i - x) / w;
    for (const [dx, dy] of NEIGHBORS) {
      const nx = x + dx, ny = y + dy, n = ny * w + nx;
      if (nx < 0 || ny < 0 || nx >= w || ny >= h || seen[n] || !walkableTile(tiles[n])) continue;
      seen[n] = 1;
      queue.push(n);
    }
  }
  return seen;
}

export function createTeamState(team: Team, home: { x: number; y: number }): TeamState {
  return { team, homeX: home.x, homeY: home.y, stock: { ...BALANCE.startStock }, faith: 0, kills: 0, disastersSurvived: 0, atWarWith: [], lastThreatTick: -1e9, focus: ['food', 'wood', 'stone'], lastRaidTick: 0, score: 0, alive: true };
}

export function generateWorld(seed: number): World {
  const t = generateTerrain(seed);
  const teams = Object.fromEntries(TEAMS.map((team) => [team, createTeamState(team, t.homes[team])])) as Record<Team, TeamState>;
  return {
    seed, tick: 0, w: t.w, h: t.h, tiles: t.tiles, deposits: t.deposits, depositAmount: t.depositAmount,
    dirtyTiles: [], burningTiles: new Map(), regrowTiles: new Map(),
    units: [], buildings: [], animals: [], teams, nextId: 1, rng: createRng(t.seed ^ 0x5eed), events: [],
    round: { startTick: 0, phase: 'play', phaseUntil: BALANCE.round.roundTicks - BALANCE.round.stormTicks },
    pathBudget: BALANCE.pathBudgetPerTick, stormUntil: 0, rainUntil: 0, effects: [], leaders: {},
  };
}
