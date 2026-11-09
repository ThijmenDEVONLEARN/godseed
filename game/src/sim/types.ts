import type { Team } from '@godseed/shared';
import type { Rng } from './rng';
import type { VoteId } from '../config/votes';

export type { Team };

export enum Tile { DeepWater, Water, Sand, Grass, Forest, Hills, Mountain, Farmland, Road, Ruins, Burnt, Bridge }
export enum Deposit { None, Tree, Stone, Iron, Gold }

export type Resource = 'wood' | 'stone' | 'food' | 'gold' | 'iron';
export type BuildingType = 'hut' | 'farm' | 'wall' | 'tower' | 'smithy' | 'temple' | 'bridge';
export type Role = 'worker' | 'warrior' | 'viewer' | 'leader' | 'hero';
/** Standing order a viewer gave with a chat command; their unit goes back to it whenever it is idle. */
export type Order = 'chop' | 'mine' | 'farm' | 'defend' | 'march' | 'pray';

export type Job =
  | { kind: 'idle' }
  | { kind: 'gather'; res: Resource; stage: 'go' | 'work' | 'return'; tx: number; ty: number; workLeft: number }
  | { kind: 'build'; targetId: number }
  | { kind: 'attack'; team: Team; targetId: number; targetIsUnit: boolean; burn?: boolean }
  | { kind: 'guard'; x: number; y: number }
  | { kind: 'pray'; workLeft: number }
  | { kind: 'defend' }
  | { kind: 'hunt'; targetId: number; stage: 'go' | 'return' };

export interface Mover {
  id: number;
  x: number;
  y: number;
  /** Previous tile and move timing, only used for render interpolation. */
  px: number;
  py: number;
  moveStartTick: number;
  moveTicks: number;
  /** Remaining path as tile indices, next step first. */
  path?: number[];
  /** Tile index the current path leads to. */
  pathGoal?: number;
  hp: number;
  maxHp: number;
  alive: boolean;
}

export interface Unit extends Mover {
  team: Team;
  role: Role;
  name?: string;
  viewerId?: string;
  order?: Order;
  hunger: number;
  carrying?: { res: Resource; amount: number };
  job: Job;
  nextHitTick: number;
  kills: number;
  respawnAt?: number;
  /** Gift buff on a viewer unit. */
  buff?: { kind: 'weapon' | 'shield'; until: number };
  /** Heroes vanish at this tick. */
  expiresAt?: number;
}

export interface Building {
  id: number;
  team: Team;
  type: BuildingType;
  x: number;
  y: number;
  hp: number;
  maxHp: number;
  /** 0..1, complete at 1. */
  progress: number;
  burning: boolean;
  alive: boolean;
  nextShotTick: number;
}

export interface Animal extends Mover {
  kind: 'sheep' | 'wolf';
  nextHitTick: number;
}

export interface TeamState {
  team: Team;
  homeX: number;
  homeY: number;
  stock: Record<Resource, number>;
  faith: number;
  kills: number;
  disastersSurvived: number;
  /** Chief !tax works again from this tick. */
  taxReadyTick?: number;
  atWarWith: Team[];
  lastThreatTick: number;
  /** Resources the team brain wants gathered, most needed first. */
  focus: Resource[];
  lastRaidTick: number;
  score: number;
  alive: boolean;
}

export type SimEventKind = 'build' | 'built' | 'destroyed' | 'death' | 'kill' | 'birth' | 'raid' | 'storm' | 'roundEnd' | 'newRound' | 'noPath' | 'fire' | 'join' | 'info' | 'god' | 'leader';

export interface SimEvent {
  tick: number;
  kind: SimEventKind;
  team?: Team;
  text: string;
  x?: number;
  y?: number;
  unitId?: number;
  /** For 'god' events: how long the effect lasts, so the camera can stay on it. */
  durationTicks?: number;
  /** For 'god' events with a moving effect, so the camera can follow it. */
  effect?: ActiveEffect['kind'];
}

export interface RoundState {
  startTick: number;
  phase: 'play' | 'storm' | 'scoreboard';
  phaseUntil: number;
  winner?: Team;
}

export interface ActiveEffect {
  kind: 'dragon' | 'tornado' | 'plague' | 'goldenAge' | 'titan' | 'eclipse' | 'flood';
  team: Team;
  until: number;
  x: number;
  y: number;
  /** Direction per tick for things that move (tornado, titan). */
  dx: number;
  dy: number;
  byName?: string;
}

export interface World {
  seed: number;
  tick: number;
  w: number;
  h: number;
  tiles: Uint8Array;
  deposits: Uint8Array;
  depositAmount: Uint8Array;
  /** Tiles changed since the renderer last looked; the renderer empties it. */
  dirtyTiles: number[];
  /** Burning forest tiles: index → tick it turns to Burnt. */
  burningTiles: Map<number, number>;
  /** Burnt tiles: index → tick it regrows to Grass. */
  regrowTiles: Map<number, number>;
  units: Unit[];
  buildings: Building[];
  animals: Animal[];
  teams: Record<Team, TeamState>;
  nextId: number;
  rng: Rng;
  events: SimEvent[];
  round: RoundState;
  pathBudget: number;
  stormUntil: number;
  /** Rain until this tick: puts out fires. */
  rainUntil: number;
  /** Timed god effects that act every tick (dragon, tornado, plague, golden age). */
  effects: ActiveEffect[];
  /** Current chief per team (unit id). */
  leaders: Partial<Record<Team, number>>;
  /** Open world vote: options, one ballot per viewer (last one counts), closing tick. */
  vote?: { options: VoteId[]; ballots: Record<string, 1 | 2 | 3>; until: number };
}
