// A small seeded random number generator (mulberry32) and the helpers built on it. The same seed
// always grows the same island, which is what makes the screenshot scenes repeatable and the
// autopilot's practice flights identical from one visit to the next.

/** A random source: call it for a float in [0, 1). */
export function createRandom(seed) {
  let a = seed | 0;
  return function random() {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** A float in [min, max) drawn from `random`. */
export function range(random, min, max) {
  return min + random() * (max - min);
}

/** An integer in [min, max] drawn from `random`. */
export function intRange(random, min, max) {
  return min + Math.floor(random() * (max - min + 1));
}

/** One element of `items`, chosen by `random`. */
export function pick(random, items) {
  return items[Math.floor(random() * items.length)];
}

/** Clamp `value` into [min, max]. */
export function clamp(value, min, max) {
  return value < min ? min : value > max ? max : value;
}

/** Smoothstepped fraction of `value` between `edge0` and `edge1`, in [0, 1]. */
export function smoothstep(edge0, edge1, value) {
  const t = clamp((value - edge0) / (edge1 - edge0), 0, 1);
  return t * t * (3 - 2 * t);
}

/** Linear interpolation between `a` and `b` by `t`. */
export function lerp(a, b, t) {
  return a + (b - a) * t;
}

/** The shortest signed turn from angle `from` to angle `to`, both radians, in (-pi, pi]. */
export function angleDelta(from, to) {
  let d = (to - from) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d < -Math.PI) d += Math.PI * 2;
  return d;
}
