import { BALANCE } from '../config/balance';
import type { Animal, Building, BuildingType, Role, SimEvent, Team, Unit, World } from './types';

export function emit(world: World, e: Omit<SimEvent, 'tick'>): void {
  world.events.push({ tick: world.tick, ...e });
}

export function spawnUnit(world: World, team: Team, role: Role, x: number, y: number, extra: Partial<Unit> = {}): Unit {
  const hp = role === 'warrior' || role === 'leader' ? BALANCE.unit.warriorHp : BALANCE.unit.workerHp;
  const u: Unit = {
    id: world.nextId++, team, role, x, y, px: x, py: y, moveStartTick: world.tick, moveTicks: 1,
    hp, maxHp: hp, alive: true, hunger: BALANCE.hunger.max, job: { kind: 'idle' }, nextHitTick: 0, kills: 0, ...extra,
  };
  world.units.push(u);
  return u;
}

export function spawnBuilding(world: World, team: Team, type: BuildingType, x: number, y: number, complete = false): Building {
  const hp = BALANCE.buildingHp[type];
  const b: Building = { id: world.nextId++, team, type, x, y, hp, maxHp: hp, progress: complete ? 1 : 0, burning: false, alive: true, nextShotTick: 0 };
  world.buildings.push(b);
  return b;
}

export function spawnAnimal(world: World, kind: Animal['kind'], x: number, y: number): Animal {
  const hp = kind === 'wolf' ? BALANCE.animals.wolfHp : BALANCE.animals.sheepHp;
  const a: Animal = { id: world.nextId++, kind, x, y, px: x, py: y, moveStartTick: world.tick, moveTicks: 1, hp, maxHp: hp, alive: true, nextHitTick: 0 };
  world.animals.push(a);
  return a;
}

export const dist = (a: { x: number; y: number }, b: { x: number; y: number }) => Math.abs(a.x - b.x) + Math.abs(a.y - b.y);

/** Living units of a team that are villagers (not viewer-controlled). */
export const npcsOf = (world: World, team: Team) => world.units.filter((u) => u.alive && u.team === team && !u.viewerId);
export const aliveUnitsOf = (world: World, team: Team) => world.units.filter((u) => u.alive && u.team === team);
export const buildingsOf = (world: World, team: Team, type?: BuildingType) =>
  world.buildings.filter((b) => b.alive && b.team === team && (!type || b.type === type));
export const completeOf = (world: World, team: Team, type: BuildingType) => buildingsOf(world, team, type).filter((b) => b.progress >= 1);
