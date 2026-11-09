export type Team = 'red' | 'blue' | 'yellow' | 'green';
export const TEAMS: readonly Team[] = ['red', 'blue', 'yellow', 'green'];

/** id = TikTok uniqueId, name = nickname (filtered by the game). */
export interface Viewer {
  id: string;
  name: string;
}

export type ViewerEvent =
  | { type: 'chat'; viewer: Viewer; text: string; ts: number }
  | { type: 'like'; viewer: Viewer; count: number; ts: number }
  | { type: 'follow'; viewer: Viewer; ts: number }
  | { type: 'share'; viewer: Viewer; ts: number }
  | { type: 'enter'; viewer: Viewer; ts: number }
  /** coins = total for the whole streak, sent once the streak has ended. */
  | { type: 'gift'; viewer: Viewer; giftId: number; giftName: string; coins: number; repeat: number; ts: number }
  | { type: 'status'; connected: boolean; source: 'tiktok' | 'fake'; ts: number };

export interface RoundEnd {
  type: 'roundEnd';
  seed: number;
  winner: Team;
  scores: Record<Team, number>;
  topPlayers: { name: string; team: Team; score: number }[];
  endedAt: number;
}

/** game → bridge */
export type GameMessage =
  | RoundEnd
  | { type: 'aiRequest'; id: string; kind: 'leaderSpeech' | 'chronicle' | 'wish'; payload: unknown };

/** bridge → game */
export type BridgeMessage =
  | { type: 'event'; event: ViewerEvent }
  | { type: 'highscores'; rounds: RoundEnd[] }
  | { type: 'aiResponse'; id: string; ok: boolean; text?: string; action?: unknown };
