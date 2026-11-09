import { TEAMS, type Team } from '@godseed/shared';
import { BALANCE } from '../config/balance';
import { EFFECT_TEXT, GIFTS, type GodEffect } from '../config/gifts';
import { aliveUnitsOf, buildingsOf, dist, emit, spawnAnimal, spawnUnit } from './entities';
import { idx, inBounds, isLand, setTile } from './grid';
import { reachable } from './worldgen/generate';
import { damageBuilding, damageUnit } from './systems/combat';
import { ignite, igniteTile } from './systems/fire';
import { newVillager } from './systems/population';
import { Deposit, Tile, type ActiveEffect, type Unit, type World } from './types';

const G = BALANCE.god;
const cap = (s: string) => s[0].toUpperCase() + s.slice(1);

export function smallestTeam(world: World): Team {
  const sizes = TEAMS.map((t) => aliveUnitsOf(world, t).length);
  const min = Math.min(...sizes);
  return world.rng.pick(TEAMS.filter((_, i) => sizes[i] === min));
}

/** The strongest other tribe: gifts that hurt go there. */
export function enemyOf(world: World, team: Team): Team {
  return TEAMS.filter((t) => t !== team).sort((a, b) => world.teams[b].score - world.teams[a].score || TEAMS.indexOf(a) - TEAMS.indexOf(b))[0];
}

/** Gift id override, then the chief gift, then the coin tier. */
export function giftEffect(world: World, coins: number, giftId: number): GodEffect | 'leader' {
  if (GIFTS.giftOverrides[giftId]) return GIFTS.giftOverrides[giftId];
  if ((GIFTS.leaderGiftId && giftId === GIFTS.leaderGiftId) || coins === GIFTS.leaderPrice) return 'leader';
  const tier = [...GIFTS.tiers].reverse().find((t) => coins >= t.minCoins) ?? GIFTS.tiers[0];
  return world.rng.pick(tier.effects);
}

const viewerUnitOf = (world: World, viewerId: string) => world.units.find((u) => u.viewerId === viewerId && u.alive);

export function applyGift(world: World, viewerId: string, name: string, coins: number, giftId: number): void {
  const effect = giftEffect(world, coins, giftId);
  if (effect === 'leader') return makeLeader(world, viewerId, name);
  const unit = viewerUnitOf(world, viewerId);
  applyGod(world, effect, unit?.team ?? smallestTeam(world), name, unit);
}

function makeLeader(world: World, viewerId: string, name: string): void {
  let u = viewerUnitOf(world, viewerId);
  if (!u) {
    const team = world.units.find((x) => x.viewerId === viewerId)?.team ?? smallestTeam(world);
    const old = world.units.findIndex((x) => x.viewerId === viewerId);
    if (old >= 0) world.units.splice(old, 1);
    const t = world.teams[team];
    u = spawnUnit(world, team, 'viewer', t.homeX, t.homeY, { viewerId, name });
  }
  const prev = world.units.find((x) => x.id === world.leaders[u.team]);
  if (prev && prev !== u) { prev.role = 'viewer'; prev.maxHp = BALANCE.unit.workerHp; prev.hp = Math.min(prev.hp, prev.maxHp); }
  world.leaders[u.team] = u.id;
  u.role = 'leader';
  u.maxHp = BALANCE.unit.warriorHp + 50;
  u.hp = u.maxHp;
  emit(world, { kind: 'leader', team: u.team, unitId: u.id, x: u.x, y: u.y, durationTicks: 30, text: `${u.name} is the new CHIEF of ${cap(u.team)}!` });
}

function landNear(world: World, cx: number, cy: number, r: number, ok = (t: number) => isLand(t) && t !== Tile.Mountain): [number, number] | undefined {
  for (let tries = 0; tries < 60; tries++) {
    const x = cx + world.rng.int(2 * r + 1) - r, y = cy + world.rng.int(2 * r + 1) - r;
    if (inBounds(world, x, y) && ok(world.tiles[idx(world.w, x, y)])) return [x, y];
  }
  return undefined;
}

const freeTile = (t: number) => t === Tile.Grass || t === Tile.Burnt;

/** Runs one god effect for `team` (the giver's tribe); harmful ones hit the strongest other tribe. */
export function applyGod(world: World, effect: GodEffect, team: Team, byName = 'The gods', unit?: Unit): void {
  const enemy = enemyOf(world, team);
  const home = world.teams[team], eh = world.teams[enemy];
  const cx = world.w >> 1, cy = world.h >> 1;
  let at = { x: home.homeX, y: home.homeY }, target: Team = team, ticks = 50;
  let moving: ActiveEffect['kind'] | undefined;
  switch (effect) {
    case 'spawnTrees': case 'spawnStone': {
      const isTree = effect === 'spawnTrees';
      for (let i = 0; i < G.spawnCount; i++) {
        const p = landNear(world, home.homeX, home.homeY, 8, freeTile);
        if (!p) continue;
        const k = idx(world.w, ...p);
        if (world.buildings.some((b) => b.alive && b.x === p[0] && b.y === p[1])) continue;
        world.deposits[k] = isTree ? Deposit.Tree : Deposit.Stone;
        world.depositAmount[k] = isTree ? BALANCE.depositAmount.tree : BALANCE.depositAmount.stone;
        setTile(world, k, isTree ? Tile.Forest : world.tiles[k]);
      }
      break;
    }
    case 'spawnSheep':
      for (let i = 0; i < G.spawnCount; i++) { const p = landNear(world, home.homeX, home.homeY, 6); if (p) spawnAnimal(world, 'sheep', ...p); }
      break;
    case 'weapon': case 'shield':
      if (!unit) { applyGod(world, 'spawnSheep', team, byName); return; }
      unit.buff = { kind: effect, until: world.tick + G.buffTicks };
      if (effect === 'shield') unit.hp = unit.maxHp;
      at = unit;
      break;
    case 'lightning': {
      target = enemy;
      const bs = buildingsOf(world, enemy).filter((b) => b.type !== 'wall');
      if (!bs.length) break;
      const b = world.rng.pick(bs);
      damageBuilding(world, b, G.lightningDamage, team);
      ignite(world, b);
      at = b;
      break;
    }
    case 'meteor': target = enemy; at = meteor(world, eh.homeX + world.rng.int(7) - 3, eh.homeY + world.rng.int(7) - 3, team); ticks = 60; break;
    case 'meteorShower':
      for (const t of TEAMS) meteor(world, world.teams[t].homeX + world.rng.int(9) - 4, world.teams[t].homeY + world.rng.int(9) - 4);
      at = { x: cx, y: cy }; ticks = 60;
      break;
    case 'wolfPack': case 'eclipse': {
      target = effect === 'eclipse' ? team : enemy;
      const n = effect === 'eclipse' ? 10 : G.wolfPack;
      const around = effect === 'eclipse' ? { x: cx, y: cy } : { x: eh.homeX, y: eh.homeY };
      for (let i = 0; i < n; i++) { const p = landNear(world, around.x, around.y, effect === 'eclipse' ? 20 : 7); if (p) spawnAnimal(world, 'wolf', ...p); }
      at = around; ticks = 100;
      break;
    }
    case 'hero': {
      target = enemy;
      const h = spawnUnit(world, team, 'hero', home.homeX, home.homeY, { name: `${byName.slice(0, 12)} the Hero`, expiresAt: world.tick + G.heroTicks });
      at = h; ticks = 60;
      emit(world, { kind: 'god', team, unitId: h.id, x: h.x, y: h.y, durationTicks: ticks, text: `${byName} ${EFFECT_TEXT.hero} ${cap(enemy)}!` });
      return;
    }
    case 'dragon': case 'tornado': case 'plague': case 'goldenAge': case 'titanWalk': {
      target = effect === 'goldenAge' ? team : enemy;
      const kind = effect === 'titanWalk' ? 'titan' : effect;
      const t = world.teams[target];
      const start = kind === 'titan' ? { x: 0, y: cy } : kind === 'tornado' ? { x: t.homeX - 12, y: t.homeY - 4 } : { x: t.homeX, y: t.homeY };
      ticks = kind === 'dragon' ? G.dragonTicks : kind === 'plague' ? G.plagueTicks : kind === 'goldenAge' ? G.goldenAgeTicks : kind === 'tornado' ? 240 : 640;
      const step = kind === 'titan' ? 0.1 : kind === 'tornado' ? 0.1 : 0;
      if (kind !== 'goldenAge' && kind !== 'plague') moving = kind;
      world.effects.push({ kind, team: target, until: world.tick + ticks, x: Math.max(0, start.x), y: start.y, dx: step, dy: kind === 'tornado' ? 0.03 : 0, byName });
      at = start;
      if (kind === 'goldenAge' || kind === 'plague') ticks = 60;
      if (kind === 'titan') ticks = 300; // the camera walks along for 30 s, then the titan keeps going on its own
      break;
    }
    case 'volcano': at = volcano(world); ticks = 80; break;
    case 'flood': {
      target = enemy;
      for (const b of buildingsOf(world, enemy, 'farm')) damageBuilding(world, b, 1000, team);
      eh.stock.food = Math.floor(eh.stock.food / 2);
      for (const u of aliveUnitsOf(world, enemy)) if (world.tiles[idx(world.w, u.x, u.y)] === Tile.Sand || world.tiles[idx(world.w, u.x, u.y)] === Tile.Farmland) damageUnit(world, u, 20, undefined, 'was swept away');
      at = { x: eh.homeX, y: eh.homeY }; ticks = 60;
      break;
    }
    case 'rainOfGold': for (const t of TEAMS) world.teams[t].stock.gold += G.rainOfGold; at = { x: cx, y: cy }; break;
    case 'rain': world.rainUntil = world.tick + G.rainTicks; at = { x: cx, y: cy }; break;
    case 'baby': { const b = newVillager(world, team); at = b; break; }
    case 'goldChest': home.stock.gold += G.goldChest; break;
  }
  const global = effect === 'eclipse' || effect === 'meteorShower' || effect === 'rainOfGold' || effect === 'titanWalk' || effect === 'rain';
  const text = global ? `${byName} ${EFFECT_TEXT[effect]}!` : `${byName} ${EFFECT_TEXT[effect]} ${cap(target)}!`;
  emit(world, { kind: 'god', team: target, x: Math.round(at.x), y: Math.round(at.y), durationTicks: ticks, unitId: unit && (effect === 'weapon' || effect === 'shield') ? unit.id : undefined, effect: moving, text });
}

function meteor(world: World, x: number, y: number, by?: Team): { x: number; y: number } {
  x = Math.max(1, Math.min(world.w - 2, x)); y = Math.max(1, Math.min(world.h - 2, y));
  const r = G.meteorRadius;
  for (const b of world.buildings) if (b.alive && dist(b, { x, y }) <= r) { damageBuilding(world, b, G.meteorDamage, by); ignite(world, b); }
  for (const u of world.units) if (u.alive && dist(u, { x, y }) <= r) damageUnit(world, u, 25, undefined, 'was hit by a meteor');
  for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
    if (Math.abs(dx) + Math.abs(dy) > r || !inBounds(world, x + dx, y + dy)) continue;
    const k = idx(world.w, x + dx, y + dy), t = world.tiles[k];
    if (t === Tile.Forest) igniteTile(world, k);
    else if (t === Tile.Grass || t === Tile.Farmland || t === Tile.Sand) { setTile(world, k, Tile.Burnt); world.regrowTiles.set(k, world.tick + BALANCE.fire.burntRegrowTicks); }
  }
  return { x, y };
}

/** A small mountain near the centre with a burning ring; skipped where it would cut a tribe off. */
function volcano(world: World): { x: number; y: number } {
  const cx = world.w >> 1, cy = world.h >> 1, r = G.volcanoRadius;
  for (let tries = 0; tries < 8; tries++) {
    const x = cx + world.rng.int(13) - 6, y = cy + world.rng.int(13) - 6;
    const changed: [number, number][] = [];
    for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
      if (dx * dx + dy * dy > r * r || !inBounds(world, x + dx, y + dy)) continue;
      const k = idx(world.w, x + dx, y + dy);
      if (!isLand(world.tiles[k])) continue;
      changed.push([k, world.tiles[k]]);
      world.tiles[k] = Tile.Mountain;
    }
    const seen = reachable(world.tiles, world.w, world.h, idx(world.w, world.teams.red.homeX, world.teams.red.homeY));
    if (TEAMS.every((t) => seen[idx(world.w, world.teams[t].homeX, world.teams[t].homeY)])) {
      for (const [k] of changed) { world.dirtyTiles.push(k); world.deposits[k] = Deposit.None; }
      for (const u of world.units) if (u.alive && dist(u, { x, y }) <= r) damageUnit(world, u, 999, undefined, 'fell into the volcano');
      for (const b of world.buildings) if (b.alive && dist(b, { x, y }) <= r + 1) { damageBuilding(world, b, 999); }
      for (let dy = -r - 2; dy <= r + 2; dy++) for (let dx = -r - 2; dx <= r + 2; dx++) if (inBounds(world, x + dx, y + dy)) igniteTile(world, idx(world.w, x + dx, y + dy));
      return { x, y };
    }
    for (const [k, t] of changed) world.tiles[k] = t;
  }
  return { x: cx, y: cy };
}

/** Timed effects, heroes and rain, once per tick. */
export function godTick(world: World): void {
  for (const e of world.effects) {
    const t = world.teams[e.team];
    switch (e.kind) {
      case 'dragon': {
        // circles over the enemy village and sets fire to things below
        const a = (world.tick % 200) / 200 * Math.PI * 2;
        e.x = t.homeX + Math.cos(a) * 6; e.y = t.homeY + Math.sin(a) * 5;
        if (world.tick % G.dragonFireEvery === 0) {
          const b = world.buildings.find((x) => x.alive && x.team === e.team && !x.burning && x.type !== 'wall' && dist(x, { x: Math.round(e.x), y: Math.round(e.y) }) <= 3);
          if (b) ignite(world, b);
          else igniteTile(world, idx(world.w, Math.round(e.x), Math.round(e.y)));
          for (const u of world.units) if (u.alive && u.team === e.team && dist(u, { x: Math.round(e.x), y: Math.round(e.y) }) <= 1) damageUnit(world, u, 10, undefined, 'was burnt by the dragon');
        }
        break;
      }
      case 'tornado': case 'titan': {
        e.x += e.dx; e.y += e.dy;
        if (e.x >= world.w - 1) e.until = world.tick;
        const x = Math.round(e.x), y = Math.round(e.y), r = e.kind === 'titan' ? 2 : 1;
        if (world.tick % 5) break;
        for (const b of world.buildings) if (b.alive && Math.abs(b.x - x) <= r && Math.abs(b.y - y) <= r) damageBuilding(world, b, e.kind === 'titan' ? 999 : G.tornadoDamage / 4);
        for (const u of world.units) if (u.alive && Math.abs(u.x - x) <= r && Math.abs(u.y - y) <= r) damageUnit(world, u, e.kind === 'titan' ? 999 : 4, undefined, e.kind === 'titan' ? 'was crushed by the titan' : 'was swept up by the tornado');
        break;
      }
      case 'plague':
        if (world.tick % G.plagueEvery === 0) for (const u of world.units) if (u.alive && u.team === e.team && u.id % 2 === world.tick % 2) damageUnit(world, u, 1, undefined, 'died of the plague');
        break;
      case 'goldenAge': break; // read by deliver()
    }
  }
  world.effects = world.effects.filter((e) => world.tick < e.until);
  for (const u of world.units) if (u.alive && u.role === 'hero') {
    if (world.tick >= (u.expiresAt ?? 0)) { u.alive = false; emit(world, { kind: 'info', team: u.team, text: `${u.name} returns to the heavens` }); continue; }
    if (u.job.kind !== 'attack') {
      const enemy = enemyOf(world, u.team);
      let best: { id: number; x: number; y: number; isUnit: boolean } | undefined;
      for (const e of [...world.units, ...world.buildings]) {
        if (!e.alive || e.team !== enemy || ('type' in e && e.type === 'wall')) continue;
        if (!best || dist(e, u) < dist(best, u)) best = { id: e.id, x: e.x, y: e.y, isUnit: 'role' in e };
      }
      if (best) { u.job = { kind: 'attack', team: enemy, targetId: best.id, targetIsUnit: best.isUnit }; u.path = undefined; }
    }
  }
}
