import { TEAMS } from '@godseed/shared';
import { BALANCE } from '../../config/balance';
import { VOTES, type VoteId } from '../../config/votes';
import { emit, spawnAnimal } from '../entities';
import { isLand } from '../grid';
import { Deposit, Tile, type World } from '../types';
import { damageBuilding } from './combat';
import { newVillager } from './population';

/** Every 5 minutes viewers get 60 s to vote between three world events. */
export function vote(world: World): void {
  const v = world.vote;
  if (!v && world.tick % VOTES.everyTicks === 0 && world.round.phase === 'play') {
    const ids = Object.keys(VOTES.options) as VoteId[];
    const options: VoteId[] = [];
    while (options.length < 3) { const id = world.rng.pick(ids); if (!options.includes(id)) options.push(id); }
    world.vote = { options, ballots: {}, until: world.tick + VOTES.openTicks };
    emit(world, { kind: 'info', text: `VOTE NOW: ${options.map((o, i) => `!vote ${i + 1} ${VOTES.options[o]}`).join(' · ')}` });
    return;
  }
  if (!v || world.tick < v.until) return;
  world.vote = undefined;
  const counts = [0, 0, 0];
  for (const n of Object.values(v.ballots)) counts[n - 1]++;
  const max = Math.max(...counts);
  if (!max) { emit(world, { kind: 'info', text: 'Nobody voted, the gods sleep' }); return; }
  const winner = v.options[world.rng.pick([0, 1, 2].filter((i) => counts[i] === max))];
  emit(world, { kind: 'info', text: `The people chose: ${VOTES.options[winner]}!` });
  applyVote(world, winner);
}

export function castVote(world: World, viewerId: string, option: 1 | 2 | 3): void {
  if (world.vote) world.vote.ballots[viewerId] = option;
}

function landNear(world: World, cx: number, cy: number, r: number): [number, number] | undefined {
  for (let tries = 0; tries < 50; tries++) {
    const x = cx + world.rng.int(2 * r + 1) - r, y = cy + world.rng.int(2 * r + 1) - r;
    if (x >= 0 && y >= 0 && x < world.w && y < world.h && isLand(world.tiles[y * world.w + x]) && world.tiles[y * world.w + x] !== Tile.Mountain) return [x, y];
  }
  return undefined;
}

function applyVote(world: World, id: VoteId): void {
  const cx = world.w >> 1, cy = world.h >> 1;
  switch (id) {
    case 'harvest': for (const t of TEAMS) world.teams[t].stock.food += 60; return;
    case 'babyBoom': for (const t of TEAMS) for (let i = 0; i < 2; i++) newVillager(world, t); return;
    case 'wolves': for (let i = 0; i < 4; i++) { const p = landNear(world, cx, cy, 8); if (p) spawnAnimal(world, 'wolf', ...p); } return;
    case 'goldRush':
      for (let i = 0; i < 6; i++) {
        const p = landNear(world, cx, cy, 7);
        if (!p) continue;
        const k = p[1] * world.w + p[0];
        world.deposits[k] = Deposit.Gold;
        world.depositAmount[k] = BALANCE.depositAmount.gold;
        world.dirtyTiles.push(k);
      }
      return;
    case 'earthquake': {
      const standing = world.buildings.filter((b) => b.alive && b.progress >= 1);
      for (let i = 0; i < 6 && standing.length; i++) damageBuilding(world, standing.splice(world.rng.int(standing.length), 1)[0], 60);
      return;
    }
  }
}
