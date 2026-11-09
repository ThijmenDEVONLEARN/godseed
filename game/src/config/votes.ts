/** World events viewers can vote for with !vote 1/2/3. */
export const VOTES = {
  everyTicks: 3000, // 5 min
  openTicks: 600, // 60 s
  options: {
    harvest: 'Bountiful harvest',
    goldRush: 'Gold rush',
    wolves: 'Wolf migration',
    earthquake: 'Earthquake',
    babyBoom: 'Baby boom',
  },
} as const;
export type VoteId = keyof typeof VOTES.options;
