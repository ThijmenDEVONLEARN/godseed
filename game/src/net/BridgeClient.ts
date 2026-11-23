import type { BridgeMessage, GameMessage, Profile, RoundEnd, ViewerEvent } from '@godseed/shared';

/** WebSocket to the local bridge with reconnect (1 s doubling to 10 s). The game runs fine without it. */
export function createBridgeClient(url: string) {
  const handlers = { event: [] as ((e: ViewerEvent) => void)[], highscores: [] as ((r: RoundEnd[]) => void)[], status: [] as ((up: boolean) => void)[], profiles: [] as ((p: Profile[]) => void)[], leaderboard: [] as ((p: Profile[]) => void)[] };
  let ws: WebSocket | undefined;
  let delay = 1000;
  const connect = () => {
    ws = new WebSocket(url);
    ws.onopen = () => { delay = 1000; handlers.status.forEach((h) => h(true)); };
    ws.onclose = () => {
      handlers.status.forEach((h) => h(false));
      setTimeout(connect, delay);
      delay = Math.min(delay * 2, 10_000);
    };
    ws.onmessage = (m) => {
      let msg: BridgeMessage;
      try { msg = JSON.parse(String(m.data)) as BridgeMessage; } catch { return; }
      if (msg.type === 'event') handlers.event.forEach((h) => h(msg.event));
      else if (msg.type === 'highscores') handlers.highscores.forEach((h) => h(msg.rounds));
      else if (msg.type === 'profiles') handlers.profiles.forEach((h) => h(msg.profiles));
      else if (msg.type === 'leaderboard') handlers.leaderboard.forEach((h) => h(msg.top));
    };
  };
  connect();
  return {
    onEvent: (h: (e: ViewerEvent) => void) => handlers.event.push(h),
    onHighscores: (h: (r: RoundEnd[]) => void) => handlers.highscores.push(h),
    onStatus: (h: (up: boolean) => void) => handlers.status.push(h),
    onProfiles: (h: (p: Profile[]) => void) => handlers.profiles.push(h),
    onLeaderboard: (h: (p: Profile[]) => void) => handlers.leaderboard.push(h),
    send: (m: GameMessage) => { if (ws?.readyState === WebSocket.OPEN) ws.send(JSON.stringify(m)); },
  };
}
export type BridgeClient = ReturnType<typeof createBridgeClient>;
