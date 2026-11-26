// The aeroplane and the rules of the sortie. This module owns the flight model — throttle, lift,
// stall, bank-to-turn, energy trading between speed and height — and the scoring: what a ring is
// worth, how a landing is graded, and when the flight is over, one way or the other. It knows
// nothing about drawing or sound; the main loop feeds it control inputs and reads back events.

import { GRADES, PLANE, SCORE } from './config.js';
import { clamp } from './random.js';

/** Events a step can raise, as bits: the main loop turns them into sound and announcements. */
export const EVENT_RING = 1;
export const EVENT_LANDED = 2;
export const EVENT_CRASH = 4;
export const EVENT_LIFTOFF = 8;

const DEG = Math.PI / 180;

/**
 * A fresh aeroplane, parked at the south end of the runway facing north, engine off, gear down,
 * tank full. `phase` runs 'ground' -> 'air' -> 'done'; `result` is filled in when it ends.
 */
export function createAircraft(world) {
  return {
    x: world.runway.cx, y: 0, z: world.runway.zSouth - 60,
    heading: 0, pitch: 0, roll: 0,
    speed: 0, vy: 0, throttle: 0,
    gearDown: true, fuel: PLANE.fuelCapacity, engineOut: false,
    phase: 'ground', stalled: false, airTime: 0,
    time: 0, ringsPassed: 0, ringScores: [], score: 0,
    ringSide: null, lastRingPoints: 0,
    result: null,
  };
}

/** The speed below which this aeroplane stalls right now: a banked turn stalls sooner. */
export function stallSpeedNow(ac) {
  return PLANE.stallSpeed * (1 + 0.38 * Math.abs(Math.sin(ac.roll)));
}

/** Height above the ground directly below, in metres. */
export function aboveGround(ac, world) {
  return ac.y - world.heightAt(ac.x, ac.z);
}

/** Finish the sortie: grade the landing, settle the score, and record what happened. */
function finishLanded(ac, world, grade, bonus, note) {
  const timePenalty = Math.max(0, Math.floor(ac.time - SCORE.freeSeconds)) * SCORE.penaltyPerSecond;
  const total = Math.max(0, ac.score + bonus - timePenalty);
  let letter = 'D';
  for (const [min, g] of GRADES) if (total >= min) { letter = g; break; }
  ac.phase = 'done';
  ac.result = {
    kind: 'landed', grade, letter, note,
    ringPoints: ac.score, landingBonus: bonus, timePenalty, total,
    complete: ac.ringsPassed === world.rings.length,
  };
  return EVENT_LANDED;
}

/** Finish the sortie the other way: the rings flown keep their points, nothing else is paid. */
function finishCrashed(ac, reason) {
  ac.phase = 'done';
  ac.result = {
    kind: 'crashed', grade: 'CRASH', letter: '—', note: reason,
    ringPoints: ac.score, landingBonus: 0, timePenalty: 0, total: ac.score,
    complete: false,
  };
  return EVENT_CRASH;
}

/** Judge a touchdown: the one moment the whole flight is remembered by. */
function judgeTouchdown(ac, world) {
  const surface = world.surfaceAt(ac.x, ac.z);
  const sink = -ac.vy;
  if (surface === 'water') return finishCrashed(ac, 'Ditched in the water.');
  if (!ac.gearDown) return finishCrashed(ac, 'Came down with the gear up.');
  if (sink > 6.5) return finishCrashed(ac, 'Hit the ground far too hard.');
  if (ac.speed > 62) return finishCrashed(ac, 'Touched down far too fast.');
  if (surface === 'runway') {
    // Alignment with the strip, whichever way along it the aeroplane is pointing.
    let diff = Math.abs(((ac.heading % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2));
    if (diff > Math.PI) diff = Math.PI * 2 - diff;
    const offAxis = Math.min(diff, Math.abs(Math.PI - diff)) / DEG;
    if (offAxis > 35) return finishLanded(ac, world, 'ROUGH', SCORE.landing.ROUGH, 'Down, but across the strip, not along it.');
    if (sink <= 1.8) return finishLanded(ac, world, 'SMOOTH', SCORE.landing.SMOOTH, 'A greaser. The passengers applauded.');
    if (sink <= 3.4) return finishLanded(ac, world, 'FIRM', SCORE.landing.FIRM, 'Firm and positive. The cargo stayed put.');
    return finishLanded(ac, world, 'HARD', SCORE.landing.HARD, 'A hard arrival. The airframe will remember that.');
  }
  if (sink <= 3.2) return finishLanded(ac, world, 'ROUGH', SCORE.landing.ROUGH, 'A field landing in the countryside. Walked away from it.');
  return finishCrashed(ac, 'Came down too hard in the fields.');
}

/** Check the next ring: a crossing of its plane, in the course's direction, inside its circle. */
function checkRing(ac, world) {
  const ring = world.rings[ac.ringsPassed];
  if (!ring) return 0;
  const dx = ac.x - ring.x, dz = ac.z - ring.z;
  const side = dx * ring.nx + dz * ring.nz;
  if (ac.ringSide === null) {
    ac.ringSide = side;
    return 0;
  }
  const crossed = ac.ringSide < 0 && side >= 0;
  ac.ringSide = side;
  if (!crossed) return 0;
  // Distance from the ring's centre, measured in the ring's own plane.
  const inPlaneX = dx - side * ring.nx;
  const inPlaneZ = dz - side * ring.nz;
  const dist = Math.hypot(inPlaneX, inPlaneZ, ac.y - ring.y);
  if (dist > ring.r) return 0;
  const points = SCORE.ringBase + Math.round(SCORE.ringCentreMax * (1 - dist / ring.r));
  ac.score += points;
  ac.ringScores.push(points);
  ac.lastRingPoints = points;
  ac.ringsPassed += 1;
  ac.ringSide = null;
  return EVENT_RING;
}

/**
 * Advance the aeroplane one fixed step. `input` is { pitch, roll } in [-1, 1] (pitch positive =
 * nose up, roll positive = bank right) and { throttleDelta } in [-1, 1] per second, or
 * { throttleSet } to move the lever straight to a position. Returns the events bitmask.
 */
export function stepAircraft(ac, world, dt, input) {
  if (ac.phase === 'done') return 0;
  ac.time += dt;
  let events = 0;

  // The lever, and the fuel it burns: an empty tank means a quiet engine and a long glide home.
  if (typeof input.throttleSet === 'number') ac.throttle = clamp(input.throttleSet, 0, 1);
  else if (input.throttleDelta) ac.throttle = clamp(ac.throttle + input.throttleDelta * dt * 0.55, 0, 1);
  if (ac.throttle > 0 && ac.fuel > 0) {
    ac.fuel = Math.max(0, ac.fuel - dt * (PLANE.fuelCapacity / 360) * (0.25 + 0.75 * ac.throttle));
  }
  ac.engineOut = ac.fuel <= 0;
  const thrustNow = ac.engineOut ? 0 : ac.throttle * PLANE.thrust;
  const drag = 0.0032 * ac.speed * ac.speed;

  if (ac.phase === 'ground') {
    // Rolling: thrust against drag and the tyres; the stick steers a little, like a taildragger.
    const accel = thrustNow - drag - 0.6;
    ac.speed = clamp(ac.speed + accel * dt, 0, PLANE.maxSpeed);
    if (ac.speed > 1) ac.heading += clamp(input.roll, -1, 1) * dt * 0.22 * clamp(ac.speed / 40, 0, 1);
    ac.x += Math.sin(ac.heading) * ac.speed * dt;
    ac.z += -Math.cos(ac.heading) * ac.speed * dt;
    ac.y = world.heightAt(ac.x, ac.z);
    ac.vy = 0;
    // Rotation: enough speed and a pull on the stick, and the wing takes the weight.
    const canFly = ac.speed > stallSpeedNow(ac) * 1.04;
    if (canFly && input.pitch > 0.25) ac.pitch = Math.min(ac.pitch + dt * 0.5, 13 * DEG);
    else ac.pitch = Math.max(ac.pitch - dt * 0.8, 0);
    if (ac.pitch > 6 * DEG && canFly) {
      ac.phase = 'air';
      ac.vy = 1.5;
      ac.airTime = 0;
      events |= EVENT_LIFTOFF;
    }
    return events;
  }

  // Airborne. Bank first: the bank is what turns the aeroplane, at a rate physics chooses.
  const targetRoll = clamp(input.roll, -1, 1) * PLANE.maxBank * DEG;
  ac.roll += clamp(targetRoll - ac.roll, -1.7 * dt, 1.7 * dt);
  ac.heading += (9.81 * Math.tan(ac.roll) / Math.max(ac.speed, 14)) * dt;

  // The stall: too slow and the nose drops away, whatever the stick says, until speed returns.
  const stallSpeed = stallSpeedNow(ac);
  ac.stalled = ac.speed < stallSpeed + (ac.stalled ? 2 : 0);
  const targetPitch = ac.stalled ? -11 * DEG : clamp(input.pitch, -1, 1) * PLANE.maxPitch * DEG;
  ac.pitch += clamp(targetPitch - ac.pitch, -1.15 * dt, 1.15 * dt);

  // Speed is energy: thrust and drag, and height bought with speed or sold for it.
  const accel = thrustNow - drag - 9.81 * Math.sin(ac.pitch) * 0.9 - (ac.stalled ? 2.5 : 0);
  ac.speed = clamp(ac.speed + accel * dt, 0, 82);

  // Height: the wing lifts in proportion to the speed it has, and a stalled wing barely lifts.
  const liftFactor = clamp(ac.speed / (stallSpeed * 1.25), 0.2, 1);
  const targetVy = Math.sin(ac.pitch) * ac.speed * liftFactor - (ac.stalled ? 6.5 : 0);
  ac.vy += (targetVy - ac.vy) * Math.min(1, dt * 1.8);

  const cosPitch = Math.cos(ac.pitch);
  ac.x += Math.sin(ac.heading) * cosPitch * ac.speed * dt;
  ac.z += -Math.cos(ac.heading) * cosPitch * ac.speed * dt;
  ac.y += ac.vy * dt;

  events |= checkRing(ac, world);

  // The ground settles everything, kindly or otherwise — but only once the aeroplane is
  // actually settling: the first moment of a climb away from rotation is not a landing.
  ac.airTime += dt;
  if (ac.airTime > 0.75 && ac.vy <= 0.5 && ac.y <= world.heightAt(ac.x, ac.z) + 0.05) {
    ac.y = world.heightAt(ac.x, ac.z);
    events |= judgeTouchdown(ac, world);
  }
  return events;
}
