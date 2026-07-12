// Central tuning + shared constants for Jungle Tag.

export const CONFIG = {
  // --- Locomotion (tuned to feel like Gorilla Tag) ---
  gravity: 9.8, // m/s^2, scaled by 2 below via a multiplier for snappier feel
  gravityMultiplier: 1.3,
  maxHandDistance: 0.55, // how far a hand can be from the head before it slips
  bodyRadius: 0.22, // collision sphere around the player's midpoint
  handRadius: 0.055, // collision sphere for each hand
  headHeightStanding: 0.0, // head offset handled by XR camera
  velocityLimit: 12, // m/s hard cap on player velocity
  jumpMultiplier: 1.12, // extra oomph transferred to velocity on release
  slipForce: 0.02, // when a hand exceeds maxHandDistance it slides
  groundFriction: 0.18,

  // --- Player model ---
  defaultColor: 0x8b5a2b,

  // --- Networking ---
  netSendHz: 15, // state broadcasts per second
  interpDelayMs: 100, // render remote players this far in the past for smoothness

  // --- Economy ---
  startingCoins: 500,
  coinTrickle: 10, // coins awarded every trickleInterval seconds of play
  trickleInterval: 15,
  tagBonus: 25, // coins for a successful infection tag
};

// Player colour palette shown on the in-world computer.
export const COLOR_SWATCHES = [
  0x8b5a2b, 0x3a2a1a, 0xd94f4f, 0x4f7fd9, 0x4fd97a, 0xd9c74f, 0xa14fd9,
  0xffffff, 0x222222, 0xff8c42, 0x42c9ff, 0xff6fae, 0x9bd94f, 0x6b4fd9,
];
