// The screenshot scenes behind ?shot=approach|rings|climb|vista (with &seed=N). Each one poses
// the real aeroplane in the real world at a moment a player would recognise — the final approach
// in cockpit view, a banked pass at a ring over the river, the climb away from the strip, and the
// high view down the course — and freezes it there. Nothing is drawn for the camera that the
// game does not draw for a player; the render is the game's own, at a fixed scene clock.

import { createWorld } from './terrain.js';
import { createAircraft } from './aircraft.js';

const DEG = Math.PI / 180;

/** Pose an airborne aeroplane: place, attitude, and the state of its sortie so far. */
function pose(world, spec) {
  const ac = createAircraft(world);
  Object.assign(ac, {
    phase: 'air',
    gearDown: true,
    stalled: false,
    ringSide: null,
  }, spec);
  return ac;
}

/** Ring points already in the book, for a scene part-way through the course. */
function flownScores(n) {
  const table = [168, 142, 185, 156, 190, 138];
  return table.slice(0, n);
}

/**
 * Set up the named scene and return { world, ac, view }: everything the main module needs to
 * paint it. Any other name is the approach.
 */
export function stageShot(name, seed) {
  const world = createWorld(seed);
  switch (name) {
    case 'rings': {
      // Banked right at the fourth ring, the river bending away below and the coast beyond.
      const ring = world.rings[3];
      const ac = pose(world, {
        x: ring.x - ring.nx * 82, y: ring.y + 3, z: ring.z - ring.nz * 82,
        heading: Math.atan2(ring.nx, -ring.nz), pitch: 2 * DEG, roll: 29 * DEG,
        speed: 47, vy: 0.5, throttle: 0.72,
        ringsPassed: 3, ringScores: flownScores(3), score: 495, fuel: 71, time: 88,
      });
      return { world, ac, view: 'chase' };
    }
    case 'climb': {
      // Just off the strip and climbing over the fields, the first ring ahead, gear still down.
      const ac = pose(world, {
        x: world.runway.cx, y: 58, z: -760,
        heading: 0, pitch: 11 * DEG, roll: 3 * DEG,
        speed: 33, vy: 4.6, throttle: 1,
        ringsPassed: 0, ringScores: [], score: 0, fuel: 96, time: 9,
      });
      return { world, ac, view: 'chase' };
    }
    case 'vista': {
      // High over the island's waist, the rest of the course strung out toward the coast.
      const ac = pose(world, {
        x: -150, y: 560, z: -1750,
        heading: 117 * DEG, pitch: -3 * DEG, roll: 10 * DEG,
        speed: 52, vy: -0.6, throttle: 0.66,
        ringsPassed: 3, ringScores: flownScores(3), score: 495, fuel: 63, time: 97,
      });
      return { world, ac, view: 'chase' };
    }
    default: {
      // The approach: cockpit view on final, the last ring ahead on the centreline and the
      // strip beyond it, instruments lit, gear down, speed on the green arc.
      const ac = pose(world, {
        x: world.runway.cx, y: 108, z: 1580,
        heading: 0, pitch: -3.5 * DEG, roll: 2 * DEG,
        speed: 34, vy: -2.3, throttle: 0.34,
        ringsPassed: 6, ringScores: flownScores(6), score: 979, fuel: 37, time: 226,
      });
      return { world, ac, view: 'cockpit' };
    }
  }
}
