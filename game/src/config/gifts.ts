/**
 * Every gift price and what it does. Phase 3 adds the effect ids per tier; this is what viewers see on screen.
 * Tiers: 1 / 5–19 / 20–49 / 50–199 / 200–499 / 500+, chief is one fixed gift of 199 coins.
 */
export type GodEffect =
  | 'spawnTrees' | 'spawnSheep' | 'spawnStone' | 'weapon' | 'shield' | 'lightning'
  | 'meteor' | 'wolfPack' | 'hero' | 'dragon' | 'tornado' | 'plague'
  | 'volcano' | 'flood' | 'goldenAge' | 'eclipse' | 'meteorShower' | 'rainOfGold' | 'titanWalk'
  | 'rain' | 'baby' | 'goldChest';

/** What viewers read in the feed and the gift showcase. */
export const EFFECT_TEXT: Record<GodEffect, string> = {
  spawnTrees: 'planted a forest', spawnSheep: 'sent a flock of sheep', spawnStone: 'raised a stone field',
  weapon: 'forged a mighty sword', shield: 'got a holy shield', lightning: 'called lightning on',
  meteor: 'dropped a METEOR on', wolfPack: 'unleashed a wolf pack on', hero: 'summoned a HERO against',
  dragon: 'sent a DRAGON to burn', tornado: 'spun a TORNADO through', plague: 'cursed with a PLAGUE',
  volcano: 'made a VOLCANO erupt', flood: 'sent a FLOOD over', goldenAge: 'started a GOLDEN AGE for',
  eclipse: 'darkened the sun: ECLIPSE', meteorShower: 'rained METEORS on the world', rainOfGold: 'made GOLD rain on everyone', titanWalk: 'awoke the TITAN',
  rain: 'made it rain', baby: 'blessed with a baby', goldChest: 'found a gold chest for',
};

export const GIFTS = {
  leaderPrice: 199,
  tiers: [
    { minCoins: 1, label: 'Trees, sheep or stone', effects: ['spawnTrees', 'spawnSheep', 'spawnStone'] },
    { minCoins: 5, label: 'Sword, shield or lightning', effects: ['weapon', 'shield', 'lightning'] },
    { minCoins: 20, label: 'Meteor, wolf pack or hero', effects: ['meteor', 'wolfPack', 'hero'] },
    { minCoins: 50, label: 'Dragon, tornado or plague', effects: ['dragon', 'tornado', 'plague'] },
    { minCoins: 200, label: 'Volcano, flood or golden age', effects: ['volcano', 'flood', 'goldenAge'] },
    { minCoins: 500, label: 'GOD EVENT for everyone', effects: ['eclipse', 'meteorShower', 'rainOfGold', 'titanWalk'] },
  ] as { minCoins: number; label: string; effects: GodEffect[] }[],
  /** Exact TikTok gift ids that should always do one thing; fill in once real gift ids are known. */
  giftOverrides: {} as Record<number, GodEffect>,
  /** TikTok gift id of the chief gift, once known; until then exactly 199 coins makes you chief. */
  leaderGiftId: 0,
  leaderLabel: 'Become CHIEF of your team',
  likesPerRain: 100,
  social: ['100 likes: rain', 'Follow: a baby is born', 'Share: gold chest'],
};
