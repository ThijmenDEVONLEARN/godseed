/**
 * Screen zones on the 1080x1920 portrait canvas.
 * TikTok covers ~130px at the top and ~480px at the bottom on phones.
 * The map and scores must stay clear of the chat; the command panel and feed may sit under it.
 * Verify with a phone screenshot (F4 shows the zones) and tune these numbers.
 */
export const SCREEN = { w: 1080, h: 1920 } as const;
export const TILE = 16;
export const MAP_TILES = { w: 64, h: 72 } as const;

export const ZONES = {
  tiktokTop: { y: 0, h: 130 },
  topBar: { y: 130, h: 100 },
  map: { x: (SCREEN.w - MAP_TILES.w * TILE) / 2, y: 230, w: MAP_TILES.w * TILE, h: MAP_TILES.h * TILE },
  bottom: { y: 1400, h: 520 },
  tiktokChat: { y: 1440, h: 480 },
} as const;
