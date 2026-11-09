import type { BuildingType, Resource } from '../sim/types';

/** Every gameplay number lives here. Ticks are 1/10 s. */
export const BALANCE = {
  ticksPerSecond: 10,
  map: { w: 64, h: 72 },
  startStock: { wood: 30, stone: 10, food: 40, gold: 0, iron: 0 } as Record<Resource, number>,
  startNpcs: 8,
  npcMin: 8,
  npcRespawnTicks: 150,
  popBase: 10,
  popPerHut: 6,
  popCap: 60,
  birthEveryTicks: 200,
  birthFoodCost: 10,

  costs: {
    hut: { wood: 20 },
    farm: { wood: 15 },
    wall: { stone: 4 },
    tower: { stone: 20, wood: 10 },
    smithy: { wood: 30, stone: 20, iron: 5 },
    temple: { stone: 40, gold: 10 },
    bridge: { wood: 15 },
  } as Record<BuildingType, Partial<Record<Resource, number>>>,
  buildingHp: { hut: 80, farm: 60, wall: 200, tower: 150, smithy: 120, temple: 200, bridge: 100 } as Record<BuildingType, number>,
  buildRatePerTick: 0.02,

  gather: { workTicks: { wood: 30, stone: 40, iron: 50, gold: 50, food: 25 } as Record<Resource, number>, carry: 5 },
  depositAmount: { tree: 10, stone: 30, iron: 25, gold: 20 },
  treeRegrowChancePer100Ticks: 0.01,

  hunger: { max: 100, dropEveryTicks: 10, eatBelow: 30, starveDamage: 1 },

  moveTicks: { default: 2, forest: 3, hills: 3, road: 1, wallClimb: 20 },
  pathBudgetPerTick: 30,
  pathMaxExpansions: 2000,

  unit: { workerHp: 30, warriorHp: 50, workerDamage: 2, warriorDamage: 5, hitEveryTicks: 10, smithyBonus: 1.5, viewerRespawnTicks: 300 },
  tower: { range: 6, damage: 3, everyTicks: 10 },
  fire: { buildingDamagePerTick: 0.5, checkEveryTicks: 10, spreadChance: 0.15, putOutChance: 0.04, forestBurnTicks: 30, burntRegrowTicks: 3000 },

  pray: { everyTicks: 30, faith: 1, templeFaith: 2 },
  guardRadius: 5,
  god: {
    heroHp: 300, heroDamage: 15, heroTicks: 1800, weaponBonus: 2, shieldHp: 30, buffTicks: 1200,
    spawnCount: 6, meteorRadius: 3, meteorDamage: 100, wolfPack: 6, lightningDamage: 60,
    dragonTicks: 1200, dragonFireEvery: 20, tornadoDamage: 80, plagueTicks: 1200, plagueEvery: 10,
    volcanoRadius: 2, goldenAgeTicks: 1800, rainTicks: 300, goldChest: 10, rainOfGold: 20,
  },

  brain: { everyTicks: 50, raidEveryTicks: 1500, raidChance: 0.3, raidWorkerShare: 0.2, threatMemoryTicks: 200, defendRadius: 6 },

  animals: { sheepStart: 14, sheepFood: 5, wolfEveryTicks: 1000, wolfMax: 6, wolfHp: 20, wolfDamage: 3, wolfAggroRange: 5, sheepHp: 6 },

  round: {
    roundTicks: 72_000,
    stormTicks: 6_000,
    scoreboardTicks: 300,
    lightningEveryTicks: 20,
    lightningDamage: 40,
    templeFaithShield: 50,
    score: { pop: 2, building: 5, kill: 3, disaster: 10 },
  },
};

export type Balance = typeof BALANCE;
