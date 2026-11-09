/**
 * Every gift price and what it does. Phase 3 adds the effect ids per tier; this is what viewers see on screen.
 * Tiers: 1 / 5–19 / 20–49 / 50–199 / 200–499 / 500+, chief is one fixed gift of 199 coins.
 */
export const GIFTS = {
  leaderPrice: 199,
  tiers: [
    { minCoins: 1, label: 'Trees, sheep or stone' },
    { minCoins: 5, label: 'Sword, shield or lightning' },
    { minCoins: 20, label: 'Meteor, wolf pack or hero' },
    { minCoins: 50, label: 'Dragon, tornado or plague' },
    { minCoins: 200, label: 'Volcano, flood or golden age' },
    { minCoins: 500, label: 'GOD EVENT for everyone' },
  ],
  leaderLabel: 'Become CHIEF of your team',
  likesPerRain: 100,
  social: ['100 likes: rain', 'Follow: a baby is born', 'Share: gold chest'],
};
