/** Camera direction (plan step 2.11). Times in ms. */
export const CAMERA = {
  zoom: 2.5, // gifts and tours
  fightZoom: 2.1, // a bit wider so both sides of a fight fit
  joinZoom: 2.8,
  fightRadius: 8,
  easeMs: 600,
  giftHoldAfterMs: 12_000, // stays this long after a gift event ends (10–15 s)
  giftMaxMs: 15_000, // long effects (titan walk) are followed at most this long, then the hold starts
  giftBusyMs: 5_000, // with more gifts waiting, each one is shown this long
  giftQueueMax: 2, // waiting gifts beyond this are skipped (oldest first)
  eventHoldMs: 6_000, // a fight stays in view this long after its last hit
  eventMergeTiles: 10, // new events this close extend the current one
  joinMs: 3_000,
  joinSpamLimit: 5, // more joins than this in joinSpamWindowMs → no join zooms
  joinSpamWindowMs: 10_000,
  tourMs: 6_000, // a village tour, only when there is no viewer to put in the spotlight
  giftMinCoins: 20, // smaller gifts get a banner and the effect, but no camera jump
  giverCooldownMs: 60_000, // the same giver gets at most one camera shot per minute
  eventMaxMs: 15_000, // a fight or raid is followed at most this long
  commandMs: 2_500, // 'you on screen' after a viewer's command
  commandQueueMax: 3,
  viewerCooldownMs: 60_000, // a viewer is put in view by a command at most once per minute
  spotlightAfterMs: 20_000, // quiet this long → spotlight on a viewer; the overview never runs longer
  spotlightMs: 6_000,
};
