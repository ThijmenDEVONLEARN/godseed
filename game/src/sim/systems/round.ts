import { TEAMS } from '@godseed/shared';
import { BALANCE } from '../../config/balance';
import { aliveUnitsOf, buildingsOf, emit } from '../entities';
import { fnv1a } from '../hash';
import { startWorld } from '../setup';
import { Tile, type Team, type World } from '../types';
import { damageBuilding } from './combat';
import { igniteTile } from './fire';
import { cap } from './population';

const R = BALANCE.round;
/** byName of storm-made effects, so they do not count as a separate survived disaster. */
export const STORM = 'The storm';

/** A8: a tribe survives a disaster when it still has at least one finished building. */
export const survived = (world: World, team: Team) => buildingsOf(world, team).some((b) => b.progress >= 1);

export function scoreOf(world: World, team: Team): number {
  const t = world.teams[team];
  return aliveUnitsOf(world, team).length * R.score.pop + buildingsOf(world, team).filter((b) => b.progress >= 1 && b.type !== 'wall').length * R.score.building
    + t.kills * R.score.kill + t.disastersSurvived * R.score.disaster;
}

/** Round clock: play → Final Storm → scoreboard → a brand-new world. */
export function round(world: World): void {
  const r = world.round;
  if (r.phase !== 'scoreboard' && world.tick % 10 === 0) for (const team of TEAMS) world.teams[team].score = scoreOf(world, team);

  if (r.phase === 'storm' && world.tick % R.lightningEveryTicks === 0) lightning(world);
  if (world.tick < r.phaseUntil) return;

  if (r.phase === 'play') {
    r.phase = 'storm';
    r.phaseUntil = r.startTick + R.roundTicks;
    world.stormUntil = r.phaseUntil;
    emit(world, { kind: 'storm', text: 'THE FINAL STORM BEGINS! Survive until the end' });
    // one tornado sweeps across the whole continent; the camera follows it like a gift event
    const y = Math.round(world.h / 2) + world.rng.int(15) - 7;
    world.effects.push({ kind: 'tornado', team: TEAMS[0], until: world.tick + 640, x: 0, y, dx: 0.1, dy: 0, byName: STORM });
    emit(world, { kind: 'god', x: 0, y, durationTicks: 300, effect: 'tornado', text: 'A storm tornado sweeps the land!' });
  } else if (r.phase === 'storm') {
    for (const team of TEAMS) {
      const t = world.teams[team];
      if (survived(world, team)) t.disastersSurvived++;
      t.score = scoreOf(world, team);
    }
    const pop = (team: Team) => aliveUnitsOf(world, team).length;
    r.winner = [...TEAMS].sort((a, b) => world.teams[b].score - world.teams[a].score || pop(b) - pop(a))[0];
    r.phase = 'scoreboard';
    r.phaseUntil = world.tick + R.scoreboardTicks;
    emit(world, { kind: 'roundEnd', team: r.winner, text: `${cap(r.winner)} wins the round!` });
  } else {
    newRound(world);
  }
}

/** Replaces the world in place, so everything holding a reference to it keeps working. */
export function newRound(world: World): void {
  const tick = world.tick;
  const next = startWorld(fnv1a(`${world.seed + 1}`));
  Object.assign(world, next, { tick, round: { startTick: tick, phase: 'play', phaseUntil: tick + R.roundTicks - R.stormTicks } });
  for (const m of [...world.units, ...world.animals]) m.moveStartTick = tick;
  world.events.push({ tick, kind: 'newRound', text: 'A new world is born' });
}

function lightning(world: World): void {
  const x = world.rng.int(world.w), y = world.rng.int(world.h), i = y * world.w + x;
  emit(world, { kind: 'storm', text: 'Lightning!', x, y });
  const b = world.buildings.find((o) => o.alive && Math.abs(o.x - x) <= 1 && Math.abs(o.y - y) <= 1);
  if (b) {
    const shield = world.teams[b.team].faith >= R.templeFaithShield && buildingsOf(world, b.team, 'temple').some((t) => t.progress >= 1);
    damageBuilding(world, b, shield ? R.lightningDamage / 2 : R.lightningDamage);
  }
  if (world.tiles[i] === Tile.Forest) igniteTile(world, i);
}
