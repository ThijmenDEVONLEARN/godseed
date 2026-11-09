import { TEAMS } from '@godseed/shared';
import { CAMERA } from '../config/camera';
import type { ActiveEffect, SimEvent, World } from '../sim/types';

/** Lower number wins: gift event > fight or other event > join > team tour > whole map. */
enum Prio { Gift = 1, Event = 2, Join = 3, Tour = 4, None = 9 }
/** What to keep in frame: one unit, a moving god effect, or the brawl around the spot. */
export type Track = { unitId: number } | { effect: ActiveEffect['kind'] } | { fight: true };
interface Focus { prio: Prio; x: number; y: number; until: number; track?: Track; /** a waiting gift may take over after this */ busyUntil?: number }
/** Smooth (interpolated) tile position of a unit, from the renderer. */
export type Locate = (unitId: number) => { x: number; y: number } | undefined;
export interface CameraTarget { x: number; y: number; zoom: number }

const EVENT_KINDS = new Set<SimEvent['kind']>(['kill', 'raid', 'fire', 'destroyed']);

/**
 * Decides where the map camera looks. Render-only: the simulation never sees it.
 * Positions are in tiles; `now` is wall-clock ms.
 */
export function createCamera(mapW: number, mapH: number) {
  let focus: Focus = { prio: Prio.None, x: mapW / 2, y: mapH / 2, until: 0 };
  const gifts: { x: number; y: number; ms: number; track?: Track }[] = [];
  let joins: number[] = [];
  let lastAction = 0;
  let tourIndex = 0;
  const current = { x: mapW / 2, y: mapH / 2, zoom: 1 };

  const set = (prio: Prio, x: number, y: number, until: number, track?: Track) => { focus = { prio, x, y, until, track }; lastAction = until; };
  const showGift = (x: number, y: number, ms: number, now: number, track?: Track) => {
    const effect = Math.min(ms, CAMERA.giftMaxMs);
    set(Prio.Gift, x, y, now + effect + CAMERA.giftHoldAfterMs, track);
    focus.busyUntil = now + Math.min(effect, CAMERA.giftBusyMs);
  };
  const free = (now: number) => focus.prio === Prio.None || now > focus.until;

  return {
    /** A gift effect at (x, y) lasting `ms`; queued behind a running gift event. */
    gift(x: number, y: number, ms: number, now: number, track?: Track): void {
      if (focus.prio === Prio.Gift && now <= focus.until) {
        gifts.push({ x, y, ms, track });
        // a gift storm: keep only the newest few so the camera never lags far behind chat
        if (gifts.length > CAMERA.giftQueueMax) gifts.shift();
      } else showGift(x, y, ms, now, track);
    },

    events(events: SimEvent[], now: number): void {
      for (const e of events) {
        if (e.x === undefined || e.y === undefined) continue;
        if (EVENT_KINDS.has(e.kind)) {
          if (focus.prio === Prio.Gift && now <= focus.until) continue;
          const near = focus.prio === Prio.Event && Math.abs(focus.x - e.x) + Math.abs(focus.y - e.y) <= CAMERA.eventMergeTiles;
          // keep following the fighter we already watch; a fight elsewhere only takes over once this one is quiet
          if (near) focus.until = now + CAMERA.eventHoldMs;
          else if (free(now) || focus.prio > Prio.Event) set(Prio.Event, e.x, e.y, now + CAMERA.eventHoldMs, { fight: true });
        } else if (e.kind === 'join') {
          joins = joins.filter((t) => now - t < CAMERA.joinSpamWindowMs);
          joins.push(now);
          if (joins.length <= CAMERA.joinSpamLimit && (free(now) || focus.prio >= Prio.Join)) set(Prio.Join, e.x, e.y, now + CAMERA.joinMs, e.unitId !== undefined ? { unitId: e.unitId } : undefined);
        }
      }
    },

    /** Where to look this frame (eased). */
    update(world: World, now: number, dtMs: number, locate: Locate = (id) => world.units.find((u) => u.id === id && u.alive)): CameraTarget {
      const giftWaiting = gifts.length > 0 && focus.prio === Prio.Gift && now > (focus.busyUntil ?? 0);
      if (now > focus.until || giftWaiting) {
        const next = gifts.shift();
        if (next) showGift(next.x, next.y, next.ms, now, next.track);
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
      const t = focus.track;
      if (t && 'unitId' in t) {
        const p = locate(t.unitId);
        if (p) { focus.x = p.x; focus.y = p.y; }
      } else if (t && 'effect' in t) {
        const e = world.effects.find((x) => x.kind === t.effect);
        if (e) { focus.x = e.x; focus.y = e.y; }
      } else if (t && 'fight' in t) {
        // frame the whole brawl: the centre of everyone fighting near the spot
        let sx = 0, sy = 0, n = 0;
        for (const u of world.units) {
          if (!u.alive || u.job.kind !== 'attack' || Math.abs(u.x - focus.x) + Math.abs(u.y - focus.y) > CAMERA.fightRadius) continue;
          const p = locate(u.id) ?? u;
          sx += p.x; sy += p.y; n++;
        }
        if (n) { focus.x += (sx / n - focus.x) * 0.1; focus.y += (sy / n - focus.y) * 0.1; }
      }
      const zoomed = focus.prio !== Prio.None;
      const zoom = !zoomed ? 1 : focus.prio === Prio.Event ? CAMERA.fightZoom : focus.prio === Prio.Join ? CAMERA.joinZoom : CAMERA.zoom;
      const k = 1 - Math.exp(-dtMs / (CAMERA.easeMs / 3));
      current.x += ((zoomed ? focus.x : mapW / 2) - current.x) * k;
      current.y += ((zoomed ? focus.y : mapH / 2) - current.y) * k;
      current.zoom += (zoom - current.zoom) * k;
      return current;
    },

    get prio(): string { return Prio[focus.prio]; },
  };
}
