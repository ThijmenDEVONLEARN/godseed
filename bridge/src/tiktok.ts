import { ControlEvent, TikTokLiveConnection, WebcastEvent } from 'tiktok-live-connector';
import type { Viewer, ViewerEvent } from '@godseed/shared';

/** The few payload fields we read (tiktok-live-proto v3). Everything is optional because TikTok changes payloads without notice. */
export interface TikTokUser { id?: string; displayId?: string; nickname?: string }
export interface TikTokGift {
  common?: { msgId?: string };
  user?: TikTokUser;
  giftId?: string | number;
  repeatCount?: number;
  repeatEnd?: number | boolean;
  gift?: { type?: number; diamondCount?: number; name?: string };
}

export const toViewer = (u: TikTokUser | undefined): Viewer | null => {
  const id = u?.id || u?.displayId;
  if (!id) return null;
  return { id: String(id).slice(0, 64), name: (u?.nickname || u?.displayId || 'viewer').slice(0, 64) };
};

/**
 * Turns raw gift messages into one game event per gift or finished streak.
 * Streakable gifts (type 1) fire on every combo tap, so only the end counts; when `repeatEnd` never arrives the
 * streak is flushed after `idleMs` with the last known count. Duplicate `msgId`s are ignored.
 */
export function createGiftStreaks(emit: (e: ViewerEvent) => void, idleMs = 10_000) {
  const open = new Map<string, { last: TikTokGift; viewer: Viewer; timer: ReturnType<typeof setTimeout> }>();
  const seen = new Set<string>();
  const send = (g: TikTokGift, viewer: Viewer) => emit({
    type: 'gift', viewer, giftId: Number(g.giftId) || 0, giftName: (g.gift?.name || 'Gift').slice(0, 40),
    coins: Math.max(1, g.gift?.diamondCount ?? 1), repeat: Math.max(1, g.repeatCount ?? 1), ts: Date.now(),
  });
  return (g: TikTokGift): void => {
    const id = g.common?.msgId;
    if (id) {
      if (seen.has(id)) return;
      seen.add(id);
      if (seen.size > 5000) seen.delete(seen.values().next().value!); // forget the oldest, msgIds never come back that late
    }
    const viewer = toViewer(g.user);
    if (!viewer) return;
    if (g.gift?.type !== 1) { send(g, viewer); return; }
    const key = `${viewer.id}:${g.giftId}`;
    const prev = open.get(key);
    if (prev) clearTimeout(prev.timer);
    if (g.repeatEnd) { open.delete(key); send(g, viewer); return; }
    open.set(key, { last: g, viewer, timer: setTimeout(() => { open.delete(key); send(g, viewer); }, idleMs) });
  };
}

/** Sums likes per viewer and sends one event per viewer every `windowMs`, so a tap storm is a handful of events. */
export function createLikeBatcher(emit: (e: ViewerEvent) => void, windowMs = 2000) {
  const pending = new Map<string, { viewer: Viewer; count: number }>();
  let timer: ReturnType<typeof setTimeout> | undefined;
  const flush = () => {
    timer = undefined;
    for (const { viewer, count } of pending.values()) emit({ type: 'like', viewer, count, ts: Date.now() });
    pending.clear();
  };
  return (user: TikTokUser | undefined, count: number | undefined): void => {
    const viewer = toViewer(user);
    if (!viewer) return;
    const p = pending.get(viewer.id) ?? { viewer, count: 0 };
    p.count += Math.max(1, count ?? 1);
    pending.set(viewer.id, p);
    timer ??= setTimeout(flush, windowMs);
  };
}

/**
 * Listens to a TikTok LIVE and publishes viewer events. Unofficial API: it can break or be rate limited,
 * so every failure only flips the status dot and retries (5 s doubling to 60 s); the game keeps running on NPCs.
 */
export function startTikTok(username: string, publish: (e: ViewerEvent) => void, signApiKey?: string) {
  const conn = new TikTokLiveConnection(username, { signApiKey, processInitialData: false });
  const status = (connected: boolean) => publish({ type: 'status', connected, source: 'tiktok', ts: Date.now() });
  const gift = createGiftStreaks(publish);
  const like = createLikeBatcher(publish);
  const simple = (type: 'follow' | 'share' | 'enter') => (d: { user?: TikTokUser }) => {
    const viewer = toViewer(d.user);
    if (viewer) publish({ type, viewer, ts: Date.now() });
  };
  let delay = 5000, stopped = false, retry: ReturnType<typeof setTimeout> | undefined;

  const connect = async () => {
    retry = undefined;
    try {
      await conn.connect();
      delay = 5000;
      status(true);
      console.log(`tiktok: connected to @${username}`);
    } catch (e) {
      console.log(`tiktok: not connected (${e instanceof Error ? e.message : String(e)}), retry in ${delay / 1000} s`);
      reconnect();
    }
  };
  const reconnect = () => {
    status(false);
    if (stopped || retry) return;
    retry = setTimeout(() => void connect(), delay);
    delay = Math.min(delay * 2, 60_000);
  };

  conn.on(WebcastEvent.CHAT, (d) => {
    const viewer = toViewer(d.user);
    if (viewer && d.content) publish({ type: 'chat', viewer, text: d.content.slice(0, 200), ts: Date.now() });
  });
  conn.on(WebcastEvent.GIFT, (d) => gift(d as TikTokGift));
  conn.on(WebcastEvent.LIKE, (d) => like(d.user, d.count));
  conn.on(WebcastEvent.FOLLOW, simple('follow'));
  conn.on(WebcastEvent.SHARE, simple('share'));
  conn.on(WebcastEvent.MEMBER, simple('enter'));
  conn.on(WebcastEvent.STREAM_END, () => { console.log('tiktok: stream ended'); reconnect(); });
  conn.on(ControlEvent.DISCONNECTED, () => { console.log('tiktok: disconnected'); reconnect(); });
  conn.on(ControlEvent.ERROR, (e: { info?: string; message?: string }) => console.log(`tiktok: error, ${e?.info ?? e?.message ?? 'unknown'}`));

  void connect();
  return { stop: async () => { stopped = true; if (retry) clearTimeout(retry); await conn.disconnect(); } };
}
