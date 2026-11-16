import { cleanName, hasBadWord, type Team, type ViewerEvent } from '@godseed/shared';
import { HELP_COOLDOWN_MS } from '../config/commands';
import { GIFTS } from '../config/gifts';
import { viewerUnit } from '../sim/commands';
import type { Simulation } from '../sim/Simulation';
import { createCooldown } from './cooldown';
import { parseChat } from './parser';

export interface CommandSinks {
  feed(text: string, team?: Team): void;
  /** Speech bubble above a unit. */
  say(unitId: number, text: string): void;
  /** Arrow and stats bubble above a unit, for !me. */
  highlight(unitId: number): void;
  vote(viewerId: string, option: 1 | 2 | 3): void;
  /** A viewer's command went through: put their villager on screen for a moment. */
  focus?(unitId: number, viewerId: string): void;
  /** Show the command list on screen (!help); the router keeps it to once a minute. */
  help?(): void;
  /** The team a returning viewer played for last, so a bare !join puts them back there. */
  lastTeam?(viewerId: string): Team | undefined;
}

/** Turns viewer events into sim commands and on-screen feedback. Gifts, likes, follows and shares get effects in phase 3. */
export function createCommandRouter(sim: Simulation, out: CommandSinks) {
  const cooldown = createCooldown();
  const welcomed = new Set<string>();
  const warned = new Set<string>(); // viewers already told to wait during their current cooldown
  let likes = 0, helpAt = -Infinity;
  return (e: ViewerEvent, now = Date.now()): void => {
    const w = sim.world;
    switch (e.type) {
      case 'chat': {
        const parsed = parseChat(e.text, e.viewer, w);
        const unit = viewerUnit(w, e.viewer.id);
        if (!parsed) { if (unit?.alive && !hasBadWord(e.text)) out.say(unit.id, e.text.slice(0, 60)); return; }
        if ('error' in parsed) { out.feed(parsed.error); return; }
        if ('ui' in parsed && parsed.ui === 'help') { if (now - helpAt >= HELP_COOLDOWN_MS) { helpAt = now; out.help?.(); } return; }
        if ('ui' in parsed) { if (unit?.alive) out.highlight(unit.id); else out.feed(`${e.viewer.name}: type !join first`); return; }
        if ('vote' in parsed) { out.vote(e.viewer.id, parsed.vote); return; }
        if (parsed.sim.kind !== 'join') {
          const wait = cooldown(e.viewer.id, now);
          if (wait) {
            if (!warned.has(e.viewer.id)) out.feed(`${unit?.name ?? e.viewer.name}: wait ${wait}s`, unit?.team);
            warned.add(e.viewer.id);
            return;
          }
          warned.delete(e.viewer.id);
          if (unit?.alive) { out.say(unit.id, e.text.trim().slice(0, 30)); out.focus?.(unit.id, e.viewer.id); }
        }
        if (parsed.sim.kind === 'join' && !parsed.sim.team) parsed.sim.team = out.lastTeam?.(e.viewer.id);
        sim.enqueue(parsed.sim);
        return;
      }
      case 'enter':
        if (welcomed.has(e.viewer.id)) return;
        welcomed.add(e.viewer.id);
        out.feed(`Welcome ${e.viewer.name}! Type !join to play`);
        return;
      case 'follow': sim.enqueue({ kind: 'god', viewerId: e.viewer.id, name: cleanName(e.viewer.name, e.viewer.id), effect: 'baby' }); return;
      case 'share': sim.enqueue({ kind: 'god', viewerId: e.viewer.id, name: cleanName(e.viewer.name, e.viewer.id), effect: 'goldChest' }); return;
      // a streak (repeat > 1) counts its full value; the chief gift is matched by giftId, or by a single gift of exactly 199
      case 'gift': sim.enqueue({ kind: 'gift', viewerId: e.viewer.id, name: cleanName(e.viewer.name, e.viewer.id), coins: e.coins * e.repeat, giftId: e.giftId }); return;
      case 'like': {
        const before = Math.floor(likes / GIFTS.likesPerRain);
        likes += e.count;
        if (Math.floor(likes / GIFTS.likesPerRain) > before) sim.enqueue({ kind: 'god', viewerId: e.viewer.id, name: cleanName(e.viewer.name, e.viewer.id), effect: 'rain' });
        return;
      }
      default: return;
    }
  };
}
