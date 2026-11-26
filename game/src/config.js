// SKYHAUL's shared numbers: the simulation step, the world's size, the aircraft's limits and the
// scoring table. Everything else in the game reads its constants from here, so the feel of the
// aeroplane can be tuned in one place.

/** The fixed simulation step, in seconds: the world advances in these, never in frame time. */
export const STEP = 1 / 60;
/** The longest frame the main loop catches up on; a longer stall is dropped, not replayed. */
export const MAX_FRAME = 0.25;

/** The world is a square of this many metres, centred on the origin; the sea is to the east. */
export const WORLD_HALF = 3000;
/** Sea level, in metres: the water's surface and the runway's height. */
export const SEA_LEVEL = 0;

/** Display conversions: the instruments speak feet and knots, the physics speaks metres. */
export const M_TO_FT = 3.28084;
export const MS_TO_KT = 1.94384;

/** The aircraft: a single-engine freight hauler, forgiving but honest about energy. */
export const PLANE = {
  /** Top of the green arc, metres per second at full throttle in level flight. */
  maxSpeed: 68,
  /** Thrust acceleration at full throttle, m/s^2, before drag and gravity have their say. */
  thrust: 13.5,
  /** Speed below which the wing stops flying, m/s (about 47 knots). */
  stallSpeed: 24,
  /** Fastest the nose may be raised or lowered, degrees. */
  maxPitch: 24,
  /** Steepest bank the controls command, degrees. */
  maxBank: 56,
  /** Fuel tank, in the game's own units: roughly six minutes at full throttle. */
  fuelCapacity: 100,
};

/** Scoring: rings, the landing bonus and the time penalty that make up the final score. */
export const SCORE = {
  /** Every ring flown through, before the centre bonus. */
  ringBase: 100,
  /** Extra for threading the ring dead centre: up to this much, scaled by how central the pass was. */
  ringCentreMax: 100,
  /** Landing bonuses by grade. */
  landing: { SMOOTH: 300, FIRM: 200, HARD: 100, ROUGH: 40 },
  /** Seconds of free flying before the clock starts costing points, and the cost per second after. */
  freeSeconds: 240,
  penaltyPerSecond: 1,
};

/** Final grades by total score, best first: [minimum score, grade] pairs. */
export const GRADES = [
  [1500, 'S'],
  [1250, 'A'],
  [950, 'B'],
  [650, 'C'],
  [0, 'D'],
];
