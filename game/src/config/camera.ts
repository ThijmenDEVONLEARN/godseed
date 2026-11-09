/** Camera direction (plan step 2.11). Times in ms. */
export const CAMERA = {
  zoom: 2.5,
  easeMs: 600,
  giftHoldAfterMs: 12_000, // stays this long after a gift event ends (10–15 s)
  eventHoldMs: 6_000, // a fight stays in view this long after its last hit
  eventMergeTiles: 10, // new events this close extend the current one
  joinMs: 3_000,
  joinSpamLimit: 5, // more joins than this in joinSpamWindowMs → no join zooms
  joinSpamWindowMs: 10_000,
  tourEveryMs: 60_000,
  tourMs: 6_000,
};
