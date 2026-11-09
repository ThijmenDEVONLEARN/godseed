import type { Team } from '@godseed/shared';
import { Tile } from '../sim/types';

/** Style A "Zonnig dal": bright colours, thick black outlines. */
export const PALETTE = {
  tile: {
    [Tile.DeepWater]: '#1d5fa8', [Tile.Water]: '#3f8fe0', [Tile.Sand]: '#efd889', [Tile.Grass]: '#6cc24a', [Tile.Forest]: '#5db13c',
    [Tile.Hills]: '#9cb35a', [Tile.Mountain]: '#8b8f99', [Tile.Farmland]: '#c9a34b', [Tile.Road]: '#c79d6a', [Tile.Ruins]: '#7d9a4a',
    [Tile.Burnt]: '#3a3530', [Tile.Bridge]: '#3f8fe0',
  } as Record<Tile, string>,
  detail: {
    [Tile.DeepWater]: '#174f8f', [Tile.Water]: '#5aa6f0', [Tile.Sand]: '#e2c96f', [Tile.Grass]: '#5db13c', [Tile.Forest]: '#2f8a3a',
    [Tile.Hills]: '#87a04a', [Tile.Mountain]: '#a3a7b0', [Tile.Farmland]: '#b38c38', [Tile.Road]: '#b38a58', [Tile.Ruins]: '#6d6f78',
    [Tile.Burnt]: '#4a423b', [Tile.Bridge]: '#5aa6f0',
  } as Record<Tile, string>,
  team: { red: '#ff4b4b', blue: '#3d8bff', yellow: '#ffd23d', green: '#38d16a' } as Record<Team, string>,
  outline: '#111111',
  skin: '#ffd7b0',
  wood: '#8a5a2b',
  stone: '#9aa0aa',
  iron: '#c7ced8',
  gold: '#ffd23d',
  font: '"Pixelify Sans", monospace',
};
