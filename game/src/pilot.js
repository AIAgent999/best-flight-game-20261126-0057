// The practice pilot: an autopilot that flies the course on its own behind the title screen, so
// the game opens on a living flight instead of a frozen picture. It steers the same aeroplane
// through the same physics as a player — throttle up, rotate, ring to ring — with a simple
// proportional law: bank toward the bearing of the next target, pitch for the height it wants,
// and keep the speed in the cruise band. It never lands; at the last ring it turns for home
// waters and comes around again.

import { PLANE } from './config.js';
import { angleDelta, clamp } from './random.js';
import { aboveGround } from './aircraft.js';

/** A pilot with its place in the course: which ring it is steering for, and how it means to
 *  approach it — 'rejoin' (fly out to a point on the ring's axis, on its approach side) or
 *  'run' (the straight run through the circle from there). */
export function createPilot() {
  return { target: 0, returning: false, mode: 'run', modeFor: -1 };
}

/** The point the pilot is steering for now: a ring centre, or the wide turn home after ring 7. */
function targetPoint(pilot, world, ac) {
  if (pilot.returning) return { x: -500, y: 300, z: 1750 };
  const ring = world.rings[pilot.target];
  return ring ?? { x: -500, y: 300, z: 1750 };
}

/**
 * One step of pilotage: read the aeroplane, return the control input a steady hand would make.
 * The caller advances the aircraft with it; when a ring is passed the pilot moves on by itself,
 * watching ringsPassed.
 */
export function pilotInput(pilot, world, ac) {
  if (ac.phase === 'ground') {
    // Full throttle down the strip, rotate when the speed is there.
    return { pitch: ac.speed > PLANE.stallSpeed * 1.15 ? 1 : 0, roll: 0, throttleSet: 1 };
  }
  if (ac.phase !== 'air') return { pitch: 0, roll: 0, throttleSet: 0 };

  // Follow the course: when the aircraft's own count moves on, so does the pilot.
  if (!pilot.returning && ac.ringsPassed > pilot.target) {
    pilot.target = ac.ringsPassed;
    if (pilot.target >= world.rings.length) pilot.returning = true;
  }
  const target = targetPoint(pilot, world, ac);
  // A ring counts only flown through in the course's direction, so it is never chased
  // point-blank from wherever the aeroplane happens to be: from the wrong side, or well off
  // the ring's axis, the pilot first rejoins — flies out to a gate on the axis, on the
  // approach side — and only then makes its run, on a carrot that retreats into the circle.
  let aimX = target.x;
  let aimZ = target.z;
  if (!pilot.returning) {
    const ring = world.rings[pilot.target];
    if (ring) {
      const relX = ac.x - ring.x;
      const relZ = ac.z - ring.z;
      const along = relX * ring.nx + relZ * ring.nz; // > 0: past the ring, on its exit side
      const perp = Math.hypot(relX - along * ring.nx, relZ - along * ring.nz);
      if (pilot.modeFor !== pilot.target) {
        pilot.modeFor = pilot.target;
        pilot.mode = along < -60 && perp < 200 ? 'run' : 'rejoin';
      }
      if (pilot.mode === 'run' && along > 40) pilot.mode = 'rejoin'; // overshot: go around again
      if (pilot.mode === 'rejoin') {
        const gateX = ring.x - ring.nx * 650;
        const gateZ = ring.z - ring.nz * 650;
        aimX = gateX;
        aimZ = gateZ;
        const toGate = Math.hypot(gateX - ac.x, gateZ - ac.z);
        if (toGate < 200 || (along < -320 && perp < 130)) pilot.mode = 'run';
      } else {
        const distToRing = Math.hypot(ring.x - ac.x, ring.z - ac.z);
        const lead = clamp(distToRing - 160, 0, 500);
        aimX = ring.x - ring.nx * lead;
        aimZ = ring.z - ring.nz * lead;
      }
    }
  }
  const dx = aimX - ac.x;
  const dz = aimZ - ac.z;
  const dist = Math.hypot(dx, dz);
  if (pilot.returning && dist < 220) {
    pilot.returning = false;
    pilot.target = 0;
    ac.ringsPassed = 0; // a fresh lap for the attract flight; nobody is keeping score
    ac.ringSide = null;
  }

  // Bank toward the target's bearing; pitch for its height, with a floor under the whole flight
  // so the show never ends in a hillside.
  const bearing = Math.atan2(dx, -dz);
  const roll = clamp(angleDelta(ac.heading, bearing) * 1.6, -0.85, 0.85);
  const floor = Math.min(world.heightAt(ac.x, ac.z) + 55, target.y + 60);
  const wantedY = Math.max(target.y, floor + (aboveGround(ac, world) < 55 ? 50 : 0));
  const desiredVy = clamp((wantedY - ac.y) * 0.22, -6, 7.5);
  const pitch = clamp(Math.asin(clamp(desiredVy / Math.max(ac.speed, 22), -0.42, 0.42)) / (PLANE.maxPitch * Math.PI / 180), -1, 1);
  // Cruise near 50 m/s, with more in hand when climbing: a full lap on one tank, with room.
  const throttleSet = clamp(0.55 + (50 - ac.speed) * 0.02 + (desiredVy > 1.5 ? 0.18 : 0), 0.3, 1);
  return { pitch, roll, throttleSet };
}
