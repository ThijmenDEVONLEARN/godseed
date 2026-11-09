import { Texture } from 'pixi.js';
import { TEAMS, type Team } from '@godseed/shared';
import { Deposit, Tile, type BuildingType, type Role } from '../sim/types';
import { PALETTE as P } from './palette';

/** Art is drawn at 2x detail: one map tile is 32 art pixels. */
export const ART = 2;
export const T = 16 * ART;

type Ctx = CanvasRenderingContext2D;
const canvas = (w: number, h: number): [HTMLCanvasElement, Ctx] => {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  return [c, c.getContext('2d')!];
};
const rect = (ctx: Ctx, x: number, y: number, w: number, h: number, c: string) => { ctx.fillStyle = c; ctx.fillRect(Math.round(x), Math.round(y), Math.round(w), Math.round(h)); };
const outlined = (ctx: Ctx, x: number, y: number, w: number, h: number, c: string, o = 2) => { rect(ctx, x - o, y - o, w + 2 * o, h + 2 * o, P.outline); rect(ctx, x, y, w, h, c); };
const tri = (ctx: Ctx, pts: number[], c: string) => { ctx.fillStyle = c; ctx.beginPath(); ctx.moveTo(pts[0], pts[1]); for (let i = 2; i < pts.length; i += 2) ctx.lineTo(pts[i], pts[i + 1]); ctx.fill(); };

/** Draws one map tile (ground plus its deposit) into a 2D context at (X, Y). `v` is a 0..1 per-tile variation. */
export function drawTile(ctx: Ctx, tile: Tile, dep: Deposit, X: number, Y: number, v: number): void {
  const s = ART;
  const ground = tile === Tile.Forest ? Tile.Grass : tile;
  rect(ctx, X, Y, T, T, P.tile[ground]);
  const d = P.detail[tile];
  switch (tile) {
    case Tile.Grass: case Tile.Forest:
      if (v < 0.35) { rect(ctx, X + 4 * s, Y + 9 * s, s, 3 * s, P.detail[Tile.Grass]); rect(ctx, X + 6 * s, Y + 10 * s, s, 2 * s, P.detail[Tile.Grass]); }
      else if (v > 0.9) { rect(ctx, X + 10 * s, Y + 4 * s, 2 * s, 2 * s, '#fff2a8'); }
      break;
    case Tile.Water: case Tile.DeepWater:
      if (v < 0.3) rect(ctx, X + 3 * s, Y + 6 * s, 6 * s, s, d);
      else if (v > 0.75) rect(ctx, X + 8 * s, Y + 11 * s, 5 * s, s, d);
      break;
    case Tile.Sand:
      if (v < 0.4) rect(ctx, X + 9 * s, Y + 5 * s, s, s, d);
      break;
    case Tile.Farmland:
      for (let k = 2; k < 16; k += 5) rect(ctx, X, Y + k * s, T, 2 * s, d);
      for (let k = 3; k < 16; k += 5) rect(ctx, X + (v * 8 + 2) * s, Y + (k - 2) * s, s, 2 * s, '#7fbf3a');
      break;
    case Tile.Hills:
      tri(ctx, [X + 2 * s, Y + 13 * s, X + 8 * s, Y + 5 * s, X + 14 * s, Y + 13 * s], d);
      break;
    case Tile.Mountain:
      tri(ctx, [X, Y + 15 * s, X + 8 * s, Y + s, X + 16 * s, Y + 15 * s], d);
      rect(ctx, X + 6 * s, Y + 3 * s, 4 * s, 3 * s, '#eef1f5');
      break;
    case Tile.Road:
      if (v < 0.5) rect(ctx, X + 5 * s, Y + 7 * s, 2 * s, s, d);
      break;
    case Tile.Ruins:
      for (const [a, b] of [[3, 9], [8, 5], [10, 11]]) outlined(ctx, X + a * s, Y + b * s, 3 * s, 2 * s, d, s);
      break;
    case Tile.Burnt:
      if (v < 0.6) rect(ctx, X + 5 * s, Y + 5 * s, 3 * s, 3 * s, d);
      break;
    case Tile.Bridge:
      rect(ctx, X, Y + 2 * s, T, 12 * s, P.outline);
      for (let k = 0; k < 16; k += 4) rect(ctx, X + k * s, Y + 3 * s, 3 * s, 10 * s, '#b07a3c');
      break;
  }
  if (dep === Deposit.Tree) {
    rect(ctx, X + 6.5 * s, Y + 10 * s, 3 * s, 5 * s, P.outline);
    rect(ctx, X + 7 * s, Y + 10 * s, 2 * s, 4.5 * s, '#5a3a1e');
    ctx.fillStyle = P.outline; ctx.beginPath(); ctx.arc(X + 8 * s, Y + 7 * s, 6.5 * s, 0, 7); ctx.fill();
    ctx.fillStyle = v > 0.5 ? P.detail[Tile.Forest] : '#2a7d34'; ctx.beginPath(); ctx.arc(X + 8 * s, Y + 7 * s, 5.5 * s, 0, 7); ctx.fill();
    rect(ctx, X + 5 * s, Y + 4 * s, 2 * s, 2 * s, '#4fae45');
  } else if (dep === Deposit.Stone) {
    outlined(ctx, X + 3 * s, Y + 8 * s, 5 * s, 4 * s, P.stone, s);
    outlined(ctx, X + 8 * s, Y + 5 * s, 5 * s, 6 * s, '#b4b9c2', s);
  } else if (dep === Deposit.Iron || dep === Deposit.Gold) {
    const c = dep === Deposit.Gold ? P.gold : P.iron;
    outlined(ctx, X + 2 * s, Y + 6 * s, 12 * s, 7 * s, '#7c8088', s);
    for (const [a, b] of [[4, 8], [9, 7], [7, 10]]) rect(ctx, X + a * s, Y + b * s, 2 * s, 2 * s, c);
  }
}

function makeUnit(team: Team, role: Role, frame: number): Texture {
  const k = 1.5 * ART, w = 16 * k, h = 20 * k;
  const [c, ctx] = canvas(w, h);
  const X = w / 2, Y = 9 * k + frame * ART;
  const col = P.team[team];
  ctx.fillStyle = 'rgba(0,0,0,.28)'; ctx.beginPath(); ctx.ellipse(X, 16.5 * k, 5 * k, 2 * k, 0, 0, 7); ctx.fill();
  rect(ctx, X - 4 * k, Y - 2 * k, 8 * k, 9 * k, P.outline); rect(ctx, X - 3 * k, Y - k, 6 * k, 7 * k, col);
  rect(ctx, X - 3 * k, Y - 8 * k, 6 * k, 6 * k, P.outline); rect(ctx, X - 2 * k, Y - 7 * k, 4 * k, 4 * k, P.skin);
  rect(ctx, X - 1.5 * k, Y - 5.5 * k, k * 0.7, k * 0.7, P.outline); rect(ctx, X + 0.8 * k, Y - 5.5 * k, k * 0.7, k * 0.7, P.outline);
  if (role === 'hero') { rect(ctx, X - 5 * k, Y - 2 * k, 10 * k, 8 * k, P.outline); rect(ctx, X - 4.5 * k, Y - 1.5 * k, 9 * k, 7 * k, P.gold); rect(ctx, X - 3 * k, Y - k, 6 * k, 7 * k, col); }
  if (role === 'warrior' || role === 'leader' || role === 'hero') { rect(ctx, X + 4 * k, Y - 7 * k, 1.5 * k, 10 * k, P.outline); rect(ctx, X + 4.3 * k, Y - 6.7 * k, 0.9 * k, 7 * k, '#dfe6ee'); rect(ctx, X + 3 * k, Y - k, 3.5 * k, 1.5 * k, P.outline); }
  if (role === 'viewer') rect(ctx, X - 3 * k, Y - 9 * k, 6 * k, 1.6 * k, col);
  if (role === 'leader' || role === 'hero') { rect(ctx, X - 3 * k, Y - 11 * k, 6 * k, 3 * k, P.gold); rect(ctx, X - 3 * k, Y - 12 * k, 1.5 * k, 1.5 * k, P.gold); rect(ctx, X + 1.5 * k, Y - 12 * k, 1.5 * k, 1.5 * k, P.gold); }
  return Texture.from(c);
}

function makeBuilding(type: BuildingType, team: Team): Texture {
  const s = ART, w = 32 * s, h = 40 * s;
  const [c, ctx] = canvas(w, h);
  const col = P.team[team];
  // anchor: bottom centre sits on the bottom of the tile, 8 art px below the tile centre
  const X = w / 2 - T / 2, Y = h - T;
  switch (type) {
    case 'hut':
      rect(ctx, X + 2 * s, Y + 7 * s, 12 * s, 9 * s, P.outline); rect(ctx, X + 3 * s, Y + 8 * s, 10 * s, 7 * s, '#d9b27c');
      tri(ctx, [X - 1 * s, Y + 9 * s, X + 8 * s, Y - 1 * s, X + 17 * s, Y + 9 * s], P.outline);
      tri(ctx, [X + 1.5 * s, Y + 8 * s, X + 8 * s, Y + 1.5 * s, X + 14.5 * s, Y + 8 * s], col);
      rect(ctx, X + 7 * s, Y + 11 * s, 3 * s, 5 * s, P.outline);
      break;
    case 'farm':
      outlined(ctx, X + 4 * s, Y + 6 * s, 8 * s, 9 * s, '#c8463b', s);
      tri(ctx, [X + 3 * s, Y + 7 * s, X + 8 * s, Y + 2 * s, X + 13 * s, Y + 7 * s], P.outline);
      tri(ctx, [X + 5 * s, Y + 6 * s, X + 8 * s, Y + 3.5 * s, X + 11 * s, Y + 6 * s], col);
      rect(ctx, X + 7 * s, Y + 10 * s, 2 * s, 5 * s, P.outline);
      break;
    case 'wall':
      outlined(ctx, X + 1 * s, Y + 3 * s, 14 * s, 12 * s, '#8f949c', s);
      for (let i = 0; i < 3; i++) rect(ctx, X + (2 + i * 5) * s, Y + 1 * s, 3 * s, 2 * s, P.outline);
      rect(ctx, X + 1 * s, Y + 8 * s, 14 * s, s, '#6d7179');
      rect(ctx, X + 1 * s, Y + 3 * s, 14 * s, 2 * s, col);
      break;
    case 'tower':
      outlined(ctx, X + 3.5 * s, Y - 9 * s, 9 * s, 24 * s, '#9aa0aa', s);
      rect(ctx, X + 3.5 * s, Y - 9 * s, 9 * s, 4 * s, col);
      for (let i = 0; i < 3; i++) rect(ctx, X + (3.5 + i * 3.5) * s, Y - 11 * s, 2 * s, 2 * s, P.outline);
      rect(ctx, X + 7 * s, Y - 2 * s, 2 * s, 3 * s, P.outline);
      break;
    case 'smithy':
      outlined(ctx, X - 1 * s, Y + 4 * s, 18 * s, 11 * s, '#6d6f78', s);
      outlined(ctx, X + 11 * s, Y - 3 * s, 3 * s, 7 * s, '#55575f', s);
      rect(ctx, X - 1 * s, Y + 4 * s, 18 * s, 3 * s, col);
      rect(ctx, X + 3 * s, Y + 9 * s, 4 * s, 3 * s, '#ff8a1f');
      break;
    case 'temple':
      rect(ctx, X - 5 * s, Y + 1 * s, 26 * s, 15 * s, P.outline); rect(ctx, X - 3 * s, Y + 3 * s, 22 * s, 11 * s, '#f1f1f1');
      for (let i = 0; i < 4; i++) rect(ctx, X + (-1 + i * 6) * s, Y + 5 * s, 2 * s, 11 * s, P.outline);
      tri(ctx, [X - 7 * s, Y + 2 * s, X + 8 * s, Y - 7 * s, X + 23 * s, Y + 2 * s], P.outline);
      tri(ctx, [X - 4 * s, Y + 1 * s, X + 8 * s, Y - 5 * s, X + 20 * s, Y + 1 * s], col);
      break;
    case 'bridge':
      // the bridge tile itself shows the planks; the building only adds team posts
      rect(ctx, X, Y + s, 2 * s, 4 * s, P.outline); rect(ctx, X + 14 * s, Y + s, 2 * s, 4 * s, P.outline);
      rect(ctx, X, Y + s, 2 * s, 2 * s, col); rect(ctx, X + 14 * s, Y + s, 2 * s, 2 * s, col);
      break;
  }
  return Texture.from(c);
}

function makeAnimal(kind: 'sheep' | 'wolf', frame: number): Texture {
  const s = ART * 1.2, w = 16 * s, h = 14 * s;
  const [c, ctx] = canvas(w, h);
  const y = frame * ART;
  ctx.fillStyle = 'rgba(0,0,0,.25)'; ctx.beginPath(); ctx.ellipse(w / 2, 12.5 * s, 5 * s, 1.5 * s, 0, 0, 7); ctx.fill();
  if (kind === 'sheep') {
    outlined(ctx, 3 * s, 4 * s + y, 9 * s, 6 * s, '#f6f6f2', s);
    outlined(ctx, 11 * s, 3 * s + y, 3 * s, 3 * s, '#3a3530', s * 0.7);
    rect(ctx, 4 * s, 10 * s, 1.5 * s, 2 * s, P.outline); rect(ctx, 9.5 * s, 10 * s, 1.5 * s, 2 * s, P.outline);
  } else {
    outlined(ctx, 2 * s, 5 * s + y, 10 * s, 5 * s, '#6e6a73', s);
    outlined(ctx, 11 * s, 3 * s + y, 4 * s, 4 * s, '#6e6a73', s * 0.7);
    rect(ctx, 12 * s, 1.5 * s + y, 1.2 * s, 1.5 * s, P.outline); rect(ctx, 14 * s, 1.5 * s + y, 1.2 * s, 1.5 * s, P.outline);
    rect(ctx, 13.5 * s, 4 * s + y, s, s, '#ff3b1f');
    rect(ctx, 3 * s, 10 * s, 1.5 * s, 2 * s, P.outline); rect(ctx, 10 * s, 10 * s, 1.5 * s, 2 * s, P.outline);
  }
  return Texture.from(c);
}

function makeFire(frame: number): Texture {
  const s = ART, [c, ctx] = canvas(16 * s, 16 * s);
  const f = frame ? [[4, 3, '#ff3b1f'], [8, 0, '#ff8a1f'], [10, 5, '#ffd23d'], [5, 7, '#ff8a1f']] : [[3, 2, '#ff3b1f'], [7, -1, '#ff8a1f'], [10, 3, '#ffd23d'], [6, 6, '#ffd23d']];
  for (const [a, b, col] of f as [number, number, string][]) rect(ctx, a * s, (b + 4) * s, 4 * s, 7 * s, col);
  return Texture.from(c);
}

function makeBeast(kind: 'dragon' | 'tornado' | 'titan', frame: number): Texture {
  const s = ART;
  if (kind === 'dragon') {
    const [c, ctx] = canvas(48 * s, 32 * s);
    const wing = frame ? 2 : 8;
    tri(ctx, [10 * s, 16 * s, 22 * s, wing * s, 24 * s, 18 * s], P.outline);
    tri(ctx, [38 * s, 16 * s, 26 * s, wing * s, 24 * s, 18 * s], P.outline);
    tri(ctx, [12 * s, 15 * s, 22 * s, (wing + 2) * s, 23 * s, 17 * s], '#b0261d');
    tri(ctx, [36 * s, 15 * s, 26 * s, (wing + 2) * s, 25 * s, 17 * s], '#b0261d');
    outlined(ctx, 18 * s, 15 * s, 12 * s, 7 * s, '#e0362a', s);
    outlined(ctx, 30 * s, 12 * s, 7 * s, 6 * s, '#e0362a', s);
    rect(ctx, 34 * s, 13 * s, 1.5 * s, 1.5 * s, P.gold);
    outlined(ctx, 10 * s, 19 * s, 8 * s, 3 * s, '#e0362a', s);
    rect(ctx, 37 * s, 15 * s, 6 * s, 2 * s, frame ? '#ffd23d' : '#ff8a1f');
    return Texture.from(c);
  }
  if (kind === 'tornado') {
    const [c, ctx] = canvas(32 * s, 40 * s);
    for (let i = 0; i < 8; i++) {
      const w = (6 + i * 3) * s, y = (34 - i * 4) * s, x = 16 * s - w / 2 + ((i + frame) % 2 ? s * 2 : -s * 2);
      outlined(ctx, x, y, w, 3 * s, i % 2 ? '#c9ced6' : '#9aa0aa', s);
    }
    return Texture.from(c);
  }
  const [c, ctx] = canvas(32 * s, 48 * s);
  const y = frame ? s : 0;
  outlined(ctx, 8 * s, 14 * s + y, 16 * s, 18 * s, '#7c8088', 2 * s);
  outlined(ctx, 11 * s, 4 * s + y, 10 * s, 9 * s, '#8b8f99', 2 * s);
  rect(ctx, 13 * s, 7 * s + y, 2 * s, 2 * s, '#ff3b1f'); rect(ctx, 17 * s, 7 * s + y, 2 * s, 2 * s, '#ff3b1f');
  outlined(ctx, 9 * s, 33 * s, 5 * s, 12 * s - y, '#6d7179', 2 * s); outlined(ctx, 18 * s, 33 * s, 5 * s, 12 * s + y - s, '#6d7179', 2 * s);
  outlined(ctx, 3 * s, 15 * s + y, 4 * s, 14 * s, '#7c8088', s); outlined(ctx, 25 * s, 15 * s + y, 4 * s, 14 * s, '#7c8088', s);
  return Texture.from(c);
}

export interface Art {
  beast: (kind: 'dragon' | 'tornado' | 'titan', frame: number) => Texture;
  unit: (team: Team, role: Role, frame: number) => Texture;
  building: (type: BuildingType, team: Team) => Texture;
  animal: (kind: 'sheep' | 'wolf', frame: number) => Texture;
  fire: (frame: number) => Texture;
}

/** Draws every sprite once at start-up. */
export function createArt(): Art {
  const roles: Role[] = ['worker', 'warrior', 'viewer', 'leader', 'hero'];
  const types: BuildingType[] = ['hut', 'farm', 'wall', 'tower', 'smithy', 'temple', 'bridge'];
  const units = new Map<string, Texture>(), buildings = new Map<string, Texture>();
  for (const team of TEAMS) {
    for (const r of roles) for (const f of [0, 1]) units.set(`${team}${r}${f}`, makeUnit(team, r, f));
    for (const b of types) buildings.set(`${b}${team}`, makeBuilding(b, team));
  }
  const animals = { sheep: [makeAnimal('sheep', 0), makeAnimal('sheep', 1)], wolf: [makeAnimal('wolf', 0), makeAnimal('wolf', 1)] };
  const fires = [makeFire(0), makeFire(1)];
  const beasts = { dragon: [makeBeast('dragon', 0), makeBeast('dragon', 1)], tornado: [makeBeast('tornado', 0), makeBeast('tornado', 1)], titan: [makeBeast('titan', 0), makeBeast('titan', 1)] };
  return {
    beast: (kind, frame) => beasts[kind][frame],
    unit: (team, role, frame) => units.get(`${team}${role}${frame}`)!,
    building: (type, team) => buildings.get(`${type}${team}`)!,
    animal: (kind, frame) => animals[kind][frame],
    fire: (frame) => fires[frame],
  };
}
