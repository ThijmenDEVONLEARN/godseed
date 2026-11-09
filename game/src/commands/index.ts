import { hasBadWord, type Team, type ViewerEvent } from '@godseed/shared';
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
}

/** Turns viewer events into sim commands and on-screen feedback. Gifts, likes, follows and shares get effects in phase 3. */
export function createCommandRouter(sim: Simulation, out: CommandSinks) {
  const cooldown = createCooldown();
  const welcomed = new Set<string>();
  return (e: ViewerEvent, now = Date.now()): void => {
    const w = sim.world;
    switch (e.type) {
      case 'chat': {
        const parsed = parseChat(e.text, e.viewer, w);
        const unit = viewerUnit(w, e.viewer.id);
        if (!parsed) { if (unit?.alive && !hasBadWord(e.text)) out.say(unit.id, e.text.slice(0, 60)); return; }
        if ('error' in parsed) { out.feed(parsed.error); return; }
        if ('ui' in parsed) { if (unit?.alive) out.highlight(unit.id); else out.feed(`${e.viewer.name}: type !join first`); return; }
        if ('vote' in parsed) { out.vote(e.viewer.id, parsed.vote); return; }
        if (parsed.sim.kind !== 'join') {
          const wait = cooldown(e.viewer.id, now);
          if (wait) { out.feed(`${unit?.name ?? e.viewer.name}: wait ${wait}s`, unit?.team); return; }
          if (unit?.alive) out.say(unit.id, e.text.trim().slice(0, 30));
        }
        sim.enqueue(parsed.sim);
        return;
      }
      case 'enter':
        if (welcomed.has(e.viewer.id)) return;
        welcomed.add(e.viewer.id);
        out.feed(`Welcome ${e.viewer.name}! Type !join to play`);
        return;
      case 'follow': out.feed(`${e.viewer.name} followed!`); return;
      case 'share': out.feed(`${e.viewer.name} shared the stream!`); return;
      case 'gift': out.feed(`${e.viewer.name} sent ${e.giftName} (${e.coins} coins)`); return;
      default: return;
    }
  };
}
