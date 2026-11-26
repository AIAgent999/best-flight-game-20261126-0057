// The island of SKYHAUL: one seeded world, generated once and only ever read afterwards. A
// patchwork of farm fields covers the lowland, a river winds from the northern hills to a bay on
// the eastern coast, roads follow the shore and cross to the airfield, and a ring of pale
// mountains closes the north. This module owns the geography: where the coast runs, how high the
// ground is, what surface a point is (water, runway or land), where the trees, houses and clouds
// stand, and the course itself — the runway and the seven rings flown through it.

import { WORLD_HALF } from './config.js';
import { clamp, createRandom, lerp, pick, range, smoothstep } from './random.js';

/** The airfield: a single north–south strip on the flat western lowland. All angles in the game
 *  are compass headings in radians, 0 = north = -z, growing clockwise (east = +x). */
export const RUNWAY = { cx: -1600, zNorth: -480, zSouth: 480, width: 48 };

/** Field colours as [r, g, b]: the greens, golds and ploughed browns of the patchwork. */
const FIELD_PALETTE = [
  [106, 168, 79], [91, 156, 70], [124, 180, 90], [143, 174, 74], [110, 158, 66],
  [194, 169, 78], [212, 186, 85], [151, 121, 80], [130, 160, 72], [168, 152, 74],
];
/** House wall and roof colours, muted so the villages sit quietly in the fields. */
const WALL_PALETTE = [[232, 226, 210], [214, 196, 168], [226, 214, 196], [206, 178, 150]];
const ROOF_PALETTE = [[150, 74, 60], [120, 84, 66], [96, 96, 104], [140, 96, 58]];

/** The mountain cones: [x, z, base radius, peak height]. Their height is part of heightAt, so
 *  flying into one is flying into the ground; the renderer draws the crisp cone over the rise. */
const MOUNTAINS = [
  [-2450, -2650, 640, 430], [-1350, -2780, 540, 350], [-350, -2820, 560, 400],
  [1050, -2720, 520, 310], [1950, -2480, 450, 260], [-2780, -1550, 500, 310],
  [-2820, -350, 440, 250], [2450, -1950, 480, 290], [-2650, 1250, 460, 230],
];

/** The river's centreline, from the northern hills to the bay. */
const RIVER_POINTS = [
  [-350, -2950], [-100, -2300], [250, -1750], [620, -1250],
  [980, -820], [1330, -430], [1620, -140], [2050, 60],
];
const RIVER_HALF_WIDTH = 34;

/** The seven rings of the course: [x, height above sea level, z]. Ring 7 stands on the runway's
 *  extended centreline, so the approach home flies straight through it to the threshold. */
const RING_POINTS = [
  [-1600, 95, -1150], [-880, 140, -1980], [60, 165, -2150], [920, 140, -1560],
  [1470, 105, -640], [620, 125, 260], [-1600, 78, 1280],
];
export const RING_RADIUS = 26;

/** The x of the coastline at height z: east of it is open water. */
export function coastX(z) {
  return 1450 + 320 * Math.sin(z * 0.00085 + 0.4) + 130 * Math.sin(z * 0.0026);
}

/** Distance from a point to the runway rectangle (0 inside it): the airfield flat. */
function runwayDistance(x, z) {
  const dx = Math.max(Math.abs(x - RUNWAY.cx) - 260, 0);
  const dz = Math.max(z < RUNWAY.zNorth - 260 ? RUNWAY.zNorth - 260 - z : z > RUNWAY.zSouth + 260 ? z - (RUNWAY.zSouth + 260) : 0, 0);
  return Math.hypot(dx, dz);
}

/** The island's rolling base height, before the mountain cones: gentle inland, higher in the
 *  north, flattened to nothing at the airfield and falling away under the sea. */
function baseHeight(x, z) {
  const inland = clamp((coastX(z) - x) / 900, 0, 1);
  const northness = 0.45 + 0.55 * clamp((-z + 800) / 2200, 0, 1);
  let h = (14 * Math.sin(x * 0.0016 + 2.0) + 11 * Math.sin(z * 0.0013 + 0.7)
    + 9 * Math.sin((x + z) * 0.0021 + 4.0) + 6 * Math.sin(x * 0.004 - z * 0.003)) * inland * northness;
  h += 20 * clamp((-x - 1200) / 1800, 0, 1) * inland;
  h *= smoothstep(120, 720, runwayDistance(x, z));
  if (x > coastX(z) - 60) h = Math.min(h, lerp(h, -4, smoothstep(coastX(z) - 60, coastX(z) + 120, x)));
  return h;
}

/** A mountain cone's height at a point: a smooth peak falling to nothing at its base radius. */
function coneHeight(x, z) {
  let h = 0;
  for (const [mx, mz, r, peak] of MOUNTAINS) {
    const d = Math.hypot(x - mx, z - mz);
    if (d < r) h = Math.max(h, peak * Math.pow(1 - d / r, 1.35));
  }
  return h;
}

/** Distance from a point to the river's centreline, for surface tests and planting. */
function riverDistance(x, z) {
  let best = Infinity;
  for (let i = 0; i < RIVER_POINTS.length - 1; i++) {
    const [ax, az] = RIVER_POINTS[i];
    const [bx, bz] = RIVER_POINTS[i + 1];
    const vx = bx - ax, vz = bz - az;
    const t = clamp(((x - ax) * vx + (z - az) * vz) / (vx * vx + vz * vz), 0, 1);
    best = Math.min(best, Math.hypot(x - (ax + vx * t), z - (az + vz * t)));
  }
  return best;
}

/**
 * Build the island for `seed`. The returned world is plain data plus three query functions:
 * heightAt (ground height in metres), surfaceAt ('water' | 'runway' | 'land') and the course.
 */
export function createWorld(seed) {
  const random = createRandom(seed);

  // The field patchwork: one cell of the grid, one colour, some sown in rows.
  const CELL = 250;
  const cells = [];
  for (let gx = -WORLD_HALF; gx < WORLD_HALF; gx += CELL) {
    for (let gz = -WORLD_HALF; gz < WORLD_HALF; gz += CELL) {
      cells.push({
        x: gx, z: gz, size: CELL,
        color: pick(random, FIELD_PALETTE),
        rows: random() < 0.45,
        shade: range(random, -7, 7),
      });
    }
  }

  // Roads: one along the shore, one from the airfield east through the village to the shore road.
  const coastRoad = [];
  for (let z = -2800; z <= 2800; z += 350) coastRoad.push([coastX(z) - 180, z]);
  const inlandRoad = [[-1600, 560], [-950, 660], [-280, 780], [350, 720], [880, 580], [coastX(430) - 180, 430]];
  const roads = [
    { points: coastRoad, width: 13 },
    { points: inlandRoad, width: 13 },
  ];

  // Trees, planted by rejection: never in the sea, on the strip, in the river or up the peaks.
  const trees = [];
  for (let tries = 0; tries < 2600 && trees.length < 300; tries++) {
    const x = range(random, -2900, 2900);
    const z = range(random, -2900, 2900);
    if (x > coastX(z) - 40) continue;
    if (runwayDistance(x, z) < 60) continue;
    if (riverDistance(x, z) < RIVER_HALF_WIDTH + 26) continue;
    const h = baseHeight(x, z) + coneHeight(x, z);
    if (h > 130) continue;
    trees.push({ x, z, h, s: range(random, 0.75, 1.5), tone: range(random, -14, 10) });
  }

  // Houses: a village on the inland road, a smaller one above the bay, and scattered farms.
  const houses = [];
  const addHouse = (x, z) => houses.push({
    x, z, h: baseHeight(x, z) + coneHeight(x, z), rot: range(random, 0, Math.PI),
    w: range(random, 16, 26), d: range(random, 13, 20), hgt: range(random, 6, 10),
    wall: pick(random, WALL_PALETTE), roof: pick(random, ROOF_PALETTE),
  });
  for (let i = 0; i < 15; i++) addHouse(-330 + range(random, -190, 190), 800 + range(random, -130, 130));
  for (let i = 0; i < 9; i++) addHouse(coastX(-420) - 300 + range(random, -120, 120), -420 + range(random, -170, 170));
  for (let i = 0; i < 9; i++) addHouse(range(random, -2400, 900), range(random, -1600, 2200));

  // Clouds: slow drifters above the course, drawn as soft billboards.
  const clouds = [];
  for (let i = 0; i < 42; i++) {
    clouds.push({
      x: range(random, -3400, 3400), y: range(random, 480, 800), z: range(random, -3400, 3400),
      s: range(random, 130, 330), speed: range(random, 4, 9),
    });
  }

  // The rings, each facing along the course: ring i faces ring i+1, the last faces the runway.
  const rings = RING_POINTS.map(([x, y, z], i) => {
    const next = i + 1 < RING_POINTS.length ? RING_POINTS[i + 1] : [RUNWAY.cx, 40, RUNWAY.zSouth];
    const dx = next[0] - x, dz = next[2] - z;
    const len = Math.hypot(dx, dz) || 1;
    return { x, y, z, r: RING_RADIUS, nx: dx / len, nz: dz / len, index: i };
  });

  /** Ground height in metres at a point: the rolling base plus any mountain cone over it. */
  function heightAt(x, z) {
    return baseHeight(x, z) + coneHeight(x, z);
  }

  /** What a point is: open water (the sea or the river), the runway, or ordinary land. */
  function surfaceAt(x, z) {
    if (Math.abs(x - RUNWAY.cx) <= RUNWAY.width / 2 && z >= RUNWAY.zNorth && z <= RUNWAY.zSouth) return 'runway';
    if (x > coastX(z)) return 'water';
    if (riverDistance(x, z) < RIVER_HALF_WIDTH) return 'water';
    return 'land';
  }

  return {
    seed, cells, roads, trees, houses, clouds, rings,
    river: { points: RIVER_POINTS, halfWidth: RIVER_HALF_WIDTH },
    mountains: MOUNTAINS.map(([x, z, r, peak]) => ({ x, z, r, peak })),
    runway: RUNWAY,
    heightAt, surfaceAt,
  };
}
