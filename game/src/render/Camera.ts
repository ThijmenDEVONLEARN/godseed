import { TEAMS } from '@godseed/shared';
import { CAMERA } from '../config/camera';
import type { ActiveEffect, SimEvent, World } from '../sim/types';

/** Lower number wins: gift > fight or raid > join or new chief > a viewer's command > spotlight or tour > whole island. */
enum Prio { Gift = 1, Event = 2, Join = 3, Command = 4, Spotlight = 5, Tour = 6, None = 9 }
/** What to keep in frame: one unit, a moving god effect, or the brawl around the spot. */
export type Track = { unitId: number } | { effect: ActiveEffect['kind'] } | { fight: true };
interface Focus { prio: Prio; x: number; y: number; until: number; track?: Track; /** a waiting gift may take over after this */ busyUntil?: number; since: number; viewerId?: string }
/** Smooth (interpolated) tile position of a unit, from the renderer. */
export type Locate = (unitId: number) => { x: number; y: number } | undefined;
export interface CameraTarget { x: number; y: number; zoom: number }
/** Who sent a gift and how much it was worth; without it a gift always gets its shot. */
export interface GiftFrom { by?: string; coins?: number }

const EVENT_KINDS = new Set<SimEvent['kind']>(['kill', 'raid', 'fire', 'destroyed']);

/**
 * Decides where the map camera looks (the director). Render-only: the simulation never sees it.
 * Positions are in tiles; `now` is wall-clock ms.
 */
export function createCamera(mapW: number, mapH: number) {
  let focus: Focus = { prio: Prio.None, x: mapW / 2, y: mapH / 2, until: 0, since: 0 };
  const gifts: { x: number; y: number; ms: number; track?: Track; coins: number }[] = [];
  const commands: { unitId: number; viewerId: string }[] = [];
  const giverShot = new Map<string, number>();
  const commandShot = new Map<string, number>();
  /** Viewers shown this round (spotlight picks someone else first), and when each was last on screen. */
  let shownRound = new Set<string>(), round = NaN;
  const lastShown = new Map<string, number>();
  /** A fight that already had its 15 s rests for as long, so the rest of the world gets a turn. */
  let rest = { x: 0, y: 0, until: -Infinity };
  let joins: number[] = [];
  let lastAction = 0;
  let tourIndex = 0;
  const current = { x: mapW / 2, y: mapH / 2, zoom: 1 };

  const set = (prio: Prio, x: number, y: number, until: number, now: number, track?: Track, viewerId?: string) => {
    focus = { prio, x, y, until, track, since: now, viewerId };
    lastAction = until;
    if (viewerId) { shownRound.add(viewerId); lastShown.set(viewerId, now); }
  };
  const showGift = (x: number, y: number, ms: number, now: number, track?: Track) => {
    const effect = Math.min(ms, CAMERA.giftMaxMs);
    set(Prio.Gift, x, y, now + effect + CAMERA.giftHoldAfterMs, now, track);
    focus.busyUntil = now + Math.min(effect, CAMERA.giftBusyMs);
  };
  const free = (now: number) => focus.prio === Prio.None || now > focus.until;
  const showCommand = (c: { unitId: number; viewerId: string }, now: number, world?: World) => {
    const u = world?.units.find((x) => x.id === c.unitId && x.alive);
    set(Prio.Command, u?.x ?? focus.x, u?.y ?? focus.y, now + CAMERA.commandMs, now, { unitId: c.unitId }, c.viewerId);
  };

  return {
    /** A gift effect at (x, y) lasting `ms`; queued behind a running gift, the biggest gift first. */
    gift(x: number, y: number, ms: number, now: number, track?: Track, from: GiftFrom = {}): void {
      if (from.coins !== undefined && from.coins < CAMERA.giftMinCoins) return;
      if (from.by) {
        if (now - (giverShot.get(from.by) ?? -Infinity) < CAMERA.giverCooldownMs) return;
        giverShot.set(from.by, now);
      }
      if (focus.prio === Prio.Gift && now <= focus.until) {
        gifts.push({ x, y, ms, track, coins: from.coins ?? 0 });
        // a gift storm: keep only a few so the camera never lags far behind chat; the smallest (then oldest) goes
        while (gifts.length > CAMERA.giftQueueMax) {
          let drop = 0;
          gifts.forEach((g, i) => { if (g.coins < gifts[drop].coins) drop = i; });
          gifts.splice(drop, 1);
        }
        gifts.sort((a, b) => b.coins - a.coins);
      } else showGift(x, y, ms, now, track);
    },

    /** A viewer's command: a short 'you on screen' shot, queued behind other commands. */
    command(unitId: number, viewerId: string, now: number): void {
      if (now - (commandShot.get(viewerId) ?? -Infinity) < CAMERA.viewerCooldownMs) return;
      if (commands.some((c) => c.viewerId === viewerId)) return;
      commandShot.set(viewerId, now);
      if (free(now) || focus.prio > Prio.Command) showCommand({ unitId, viewerId }, now);
      else if (commands.length < CAMERA.commandQueueMax) commands.push({ unitId, viewerId });
    },

    events(events: SimEvent[], now: number): void {
      for (const e of events) {
        if (e.x === undefined || e.y === undefined) continue;
        if (EVENT_KINDS.has(e.kind)) {
          if (focus.prio === Prio.Gift && now <= focus.until) continue;
          const near = focus.prio === Prio.Event && Math.abs(focus.x - e.x) + Math.abs(focus.y - e.y) <= CAMERA.eventMergeTiles;
          // keep following the fight we already watch, but not for ever; a fight elsewhere only takes over once this one is quiet
          if (near) focus.until = Math.min(focus.since + CAMERA.eventMaxMs, now + CAMERA.eventHoldMs);
          else if (now < rest.until && Math.abs(rest.x - e.x) + Math.abs(rest.y - e.y) <= CAMERA.eventMergeTiles) continue;
          else if (free(now) || focus.prio > Prio.Event) set(Prio.Event, e.x, e.y, now + CAMERA.eventHoldMs, now, { fight: true });
        } else if (e.kind === 'join' || e.kind === 'leader') {
          if (e.kind === 'join') {
            joins = joins.filter((t) => now - t < CAMERA.joinSpamWindowMs);
            joins.push(now);
            if (joins.length > CAMERA.joinSpamLimit) continue;
          }
          if (free(now) || focus.prio >= Prio.Join) set(Prio.Join, e.x, e.y, now + CAMERA.joinMs, now, e.unitId !== undefined ? { unitId: e.unitId } : undefined, e.viewerId);
        }
      }
    },

    /** Where to look this frame (eased). */
    update(world: World, now: number, dtMs: number, locate: Locate = (id) => world.units.find((u) => u.id === id && u.alive)): CameraTarget {
      if (world.seed !== round) { round = world.seed; shownRound = new Set(); }
      const giftWaiting = gifts.length > 0 && focus.prio === Prio.Gift && now > (focus.busyUntil ?? 0);
      if (now > focus.until || giftWaiting) {
        if (focus.prio === Prio.Event && focus.until - focus.since >= CAMERA.eventMaxMs) rest = { x: focus.x, y: focus.y, until: now + CAMERA.eventMaxMs };
        const next = gifts.shift();
        if (next) showGift(next.x, next.y, next.ms, now, next.track);
        else if (focus.prio !== Prio.None) focus = { prio: Prio.None, x: mapW / 2, y: mapH / 2, until: 0, since: now };
      }
      // a waiting command only gets its turn when nothing bigger is on
      if (commands.length && (focus.prio === Prio.None || (focus.prio > Prio.Command && now > focus.until) || focus.prio >= Prio.Spotlight)) showCommand(commands.shift()!, now, world);
      if (focus.prio === Prio.None && now - lastAction > CAMERA.spotlightAfterMs) {
        const viewers = world.units.filter((u) => u.alive && u.viewerId);
        if (viewers.length) {
          // someone not yet shown this round, else whoever was shown longest ago
          const pool = viewers.filter((u) => !shownRound.has(u.viewerId!));
          const pick = (pool.length ? pool : viewers).reduce((a, b) => ((lastShown.get(a.viewerId!) ?? -Infinity) <= (lastShown.get(b.viewerId!) ?? -Infinity) ? a : b));
          set(Prio.Spotlight, pick.x, pick.y, now + CAMERA.spotlightMs, now, { unitId: pick.id }, pick.viewerId);
        } else {
          const team = TEAMS[tourIndex++ % TEAMS.length];
          const units = world.units.filter((u) => u.alive && u.team === team);
          const home = world.teams[team];
          const x = units.length ? units.reduce((s, u) => s + u.x, 0) / units.length : home.homeX;
          const y = units.length ? units.reduce((s, u) => s + u.y, 0) / units.length : home.homeY;
          // busiest point: the tribe's centre of mass, pulled towards home so raiders do not drag the camera off
          set(Prio.Tour, (x + home.homeX) / 2, (y + home.homeY) / 2, now + CAMERA.tourMs, now);
        }
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
      const zoom = !zoomed ? 1 : focus.prio === Prio.Event ? CAMERA.fightZoom : focus.prio === Prio.Join || focus.prio === Prio.Command ? CAMERA.joinZoom : CAMERA.zoom;
      const k = 1 - Math.exp(-dtMs / (CAMERA.easeMs / 3));
      current.x += ((zoomed ? focus.x : mapW / 2) - current.x) * k;
      current.y += ((zoomed ? focus.y : mapH / 2) - current.y) * k;
      current.zoom += (zoom - current.zoom) * k;
      return current;
    },

    get prio(): string { return Prio[focus.prio]; },
    /** The viewer on screen right now (join, command, spotlight), for the name banner. */
    get viewer(): string | undefined { return focus.prio === Prio.None ? undefined : focus.viewerId; },
    /** What the camera is on right now, for the 3D director's framing rule. */
    get focus(): { x: number; y: number; zoomed: boolean; track?: Track } { return { x: focus.x, y: focus.y, zoomed: focus.prio !== Prio.None, track: focus.track }; },
  };
}
