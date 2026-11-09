import { TEAMS } from '@godseed/shared';
import { CAMERA } from '../config/camera';
import type { SimEvent, World } from '../sim/types';

/** Lower number wins: gift event > fight or other event > join > team tour > whole map. */
enum Prio { Gift = 1, Event = 2, Join = 3, Tour = 4, None = 9 }
interface Focus { prio: Prio; x: number; y: number; until: number }
export interface CameraTarget { x: number; y: number; zoom: number }

const EVENT_KINDS = new Set<SimEvent['kind']>(['kill', 'raid', 'fire', 'destroyed']);

/**
 * Decides where the map camera looks. Render-only: the simulation never sees it.
 * Positions are in tiles; `now` is wall-clock ms.
 */
export function createCamera(mapW: number, mapH: number) {
  let focus: Focus = { prio: Prio.None, x: mapW / 2, y: mapH / 2, until: 0 };
  const gifts: { x: number; y: number; ms: number }[] = [];
  let joins: number[] = [];
  let lastAction = 0;
  let tourIndex = 0;
  const current = { x: mapW / 2, y: mapH / 2, zoom: 1 };

  const set = (prio: Prio, x: number, y: number, until: number) => { focus = { prio, x, y, until }; lastAction = until; };
  const free = (now: number) => focus.prio === Prio.None || now > focus.until;

  return {
    /** A gift effect at (x, y) lasting `ms`; queued behind a running gift event. */
    gift(x: number, y: number, ms: number, now: number): void {
      if (focus.prio === Prio.Gift && now <= focus.until) gifts.push({ x, y, ms });
      else set(Prio.Gift, x, y, now + ms + CAMERA.giftHoldAfterMs);
    },

    events(events: SimEvent[], now: number): void {
      for (const e of events) {
        if (e.x === undefined || e.y === undefined) continue;
        if (EVENT_KINDS.has(e.kind)) {
          if (focus.prio === Prio.Gift && now <= focus.until) continue;
          const near = focus.prio === Prio.Event && Math.abs(focus.x - e.x) + Math.abs(focus.y - e.y) <= CAMERA.eventMergeTiles;
          if (near || free(now) || focus.prio > Prio.Event) set(Prio.Event, near ? focus.x : e.x, near ? focus.y : e.y, now + CAMERA.eventHoldMs);
        } else if (e.kind === 'join') {
          joins = joins.filter((t) => now - t < CAMERA.joinSpamWindowMs);
          joins.push(now);
          if (joins.length <= CAMERA.joinSpamLimit && (free(now) || focus.prio >= Prio.Join)) set(Prio.Join, e.x, e.y, now + CAMERA.joinMs);
        }
      }
    },

    /** Where to look this frame (eased). */
    update(world: World, now: number, dtMs: number): CameraTarget {
      if (now > focus.until) {
        const next = gifts.shift();
        if (next) set(Prio.Gift, next.x, next.y, now + next.ms + CAMERA.giftHoldAfterMs);
        else if (focus.prio !== Prio.None) focus = { prio: Prio.None, x: mapW / 2, y: mapH / 2, until: 0 };
      }
      if (focus.prio === Prio.None && now - lastAction > CAMERA.tourEveryMs) {
        const team = TEAMS[tourIndex++ % TEAMS.length];
        const units = world.units.filter((u) => u.alive && u.team === team);
        const home = world.teams[team];
        const x = units.length ? units.reduce((s, u) => s + u.x, 0) / units.length : home.homeX;
        const y = units.length ? units.reduce((s, u) => s + u.y, 0) / units.length : home.homeY;
        // busiest point: the tribe's centre of mass, pulled towards home so raiders do not drag the camera off
        set(Prio.Tour, (x + home.homeX) / 2, (y + home.homeY) / 2, now + CAMERA.tourMs);
      }
      const zoomed = focus.prio !== Prio.None;
      const k = 1 - Math.exp(-dtMs / (CAMERA.easeMs / 3));
      current.x += ((zoomed ? focus.x : mapW / 2) - current.x) * k;
      current.y += ((zoomed ? focus.y : mapH / 2) - current.y) * k;
      current.zoom += ((zoomed ? CAMERA.zoom : 1) - current.zoom) * k;
      return current;
    },

    get prio(): string { return Prio[focus.prio]; },
  };
}
