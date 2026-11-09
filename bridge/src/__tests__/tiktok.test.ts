import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ViewerEvent } from '@godseed/shared';
import { createGiftStreaks, createLikeBatcher, toViewer, type TikTokGift } from '../tiktok';
import fx from './fixtures/gifts.json';

const gifts = fx as unknown as { rose: TikTokGift; roseStreak: TikTokGift[]; lion: TikTokGift };

describe('tiktok adapter', () => {
  let out: ViewerEvent[];
  beforeEach(() => { out = []; vi.useFakeTimers(); });
  afterEach(() => vi.useRealTimers());

  it('names a viewer by nickname and keys it by id', () => {
    expect(toViewer({ id: '1', displayId: 'a_b', nickname: 'Ab' })).toEqual({ id: '1', name: 'Ab' });
    expect(toViewer({ displayId: 'a_b' })).toEqual({ id: 'a_b', name: 'a_b' });
    expect(toViewer(undefined)).toBeNull();
  });

  it('sends a streak once, at its end, with the final count', () => {
    const gift = createGiftStreaks((e) => out.push(e));
    for (const g of gifts.roseStreak) gift(g);
    expect(out).toMatchObject([{ type: 'gift', giftName: 'Rose', coins: 1, repeat: 7, viewer: { id: '111' } }]);
  });

  it('flushes a streak without repeatEnd after 10 s', () => {
    const gift = createGiftStreaks((e) => out.push(e));
    gift(gifts.roseStreak[0]!); gift(gifts.roseStreak[1]!);
    vi.advanceTimersByTime(9_999);
    expect(out).toHaveLength(0);
    vi.advanceTimersByTime(1);
    expect(out).toMatchObject([{ repeat: 4 }]);
    vi.advanceTimersByTime(20_000);
    expect(out).toHaveLength(1);
  });

  it('sends non-streakable gifts at once and drops duplicate msgIds', () => {
    const gift = createGiftStreaks((e) => out.push(e));
    gift(gifts.lion); gift(gifts.lion);
    expect(out).toMatchObject([{ giftName: 'Lion', coins: 29999, repeat: 1 }]);
  });

  it('bundles likes per viewer every 2 s', () => {
    const like = createLikeBatcher((e) => out.push(e));
    for (let i = 0; i < 10; i++) like({ id: 'v1', nickname: 'V' }, 5);
    like({ id: 'v2', nickname: 'W' }, 3);
    expect(out).toHaveLength(0);
    vi.advanceTimersByTime(2000);
    expect(out).toMatchObject([{ type: 'like', count: 50, viewer: { id: 'v1' } }, { type: 'like', count: 3, viewer: { id: 'v2' } }]);
  });
});
