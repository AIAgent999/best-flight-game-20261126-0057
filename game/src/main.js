// SKYHAUL's boot and one loop. The world advances in fixed 1/60 s steps (several in a slow
// frame, none in a fast one) and the renderer paints what is there. The game moves between five
// screens: the title, over an attract flight the autopilot flies; the briefing; the flight
// itself; pause; and the results. Two things are read from the address: ?seed=N fixes the
// island, and ?shot=approach|rings|climb|vista stages a frozen scene for a screenshot instead
// of running the loop, paints it twice and sets window.__shotReady.

import { MAX_FRAME, STEP } from './config.js';
import { createWorld } from './terrain.js';
import { createAircraft, stepAircraft, EVENT_CRASH, EVENT_LANDED, EVENT_LIFTOFF, EVENT_RING } from './aircraft.js';
import { createPilot, pilotInput } from './pilot.js';
import {
  ACTION_CONFIRM, ACTION_GEAR, ACTION_MUTE, ACTION_PAUSE, ACTION_RESTART, ACTION_VIEW, createInput,
} from './input.js';
import { createAudio } from './audio.js';
import { createRenderer } from './render.js';
import { drawCockpit } from './cockpit.js';
import { drawBriefing, drawHUD, drawPause, drawResults, drawTitle } from './hud.js';
import { stageShot } from './shots.js';

const params = new URLSearchParams(window.location.search);
const shot = params.get('shot');
const seedParam = Number.parseInt(params.get('seed') ?? '', 10);
const seed = Number.isInteger(seedParam) ? seedParam : 20261126;

const canvas = document.getElementById('game');
const status = document.getElementById('status');
const renderer = createRenderer(canvas);
const audio = createAudio();

/** Screen readers hear the screens change and the flight's great events. */
function announce(message) {
  status.textContent = message;
}

/** Paint one frame of a flight: the scene, the cockpit if the view is in it, then the HUD —
 *  unless the title or briefing is up, when the flight behind them stays clean. */
function paintFlight(world, ac, view, t, flash, showHud = true) {
  renderer.draw(world, ac, view, t);
  const { ctx, width: W, height: H } = renderer;
  if (W === 0) return;
  if (view === 'cockpit') drawCockpit(ctx, W, H, ac, t);
  if (showHud) drawHUD(ctx, W, H, ac, world, view, t, flash);
}

/** A staged screenshot scene: posed, painted twice, then held still for the camera. */
function runShot(name) {
  const scene = stageShot(name, seed);
  let painted = 0;
  function paint() {
    paintFlight(scene.world, scene.ac, scene.view, 6, null);
    painted += 1;
    if (painted < 3) requestAnimationFrame(paint);
    else {
      window.__shotReady = true;
      announce(`Screenshot scene ${name} ready.`);
    }
  }
  requestAnimationFrame(paint);
}

/** The game proper: screens, the sortie, the attract flight behind the title. */
function runGame() {
  const world = createWorld(seed);
  const input = createInput(canvas);
  input.onFirstGesture(() => audio.ensure());

  let screen = 'title';
  let view = 'chase';
  // The attract flight: its own aeroplane and pilot, flying the course behind the title.
  let attractAc = createAircraft(world);
  let pilot = createPilot();
  // The player's aeroplane, made fresh at every start.
  let ac = createAircraft(world);
  let flash = null;
  let flashAt = 0;
  let sceneT = 0;
  let lastWarble = 0;
  let accumulator = 0;
  let last = performance.now();

  function startSortie() {
    ac = createAircraft(world);
    flash = null;
    screen = 'play';
    audio.click();
    announce('Engine running. Throttle up with Shift, rotate with the up arrow.');
  }

  function handleActions() {
    const actions = input.takeActions();
    if (actions & ACTION_MUTE) {
      audio.ensure();
      announce(audio.toggleMute() ? 'Sound off.' : 'Sound on.');
    }
    if (screen === 'title') {
      if (actions & ACTION_CONFIRM) {
        screen = 'briefing';
        audio.click();
        announce('Flight briefing. Press Enter to start the engine.');
      }
      return;
    }
    if (screen === 'briefing') {
      if (actions & ACTION_CONFIRM) startSortie();
      else if (actions & ACTION_PAUSE) screen = 'title';
      return;
    }
    if (screen === 'play') {
      if (actions & ACTION_PAUSE) {
        screen = 'pause';
        announce('Paused.');
      } else if (actions & ACTION_RESTART) startSortie();
      else if (actions & ACTION_VIEW) {
        view = view === 'chase' ? 'cockpit' : 'chase';
        audio.click();
      } else if (actions & ACTION_GEAR) {
        if (ac.phase === 'air') {
          ac.gearDown = !ac.gearDown;
          flash = { text: ac.gearDown ? 'GEAR DOWN' : 'GEAR UP', age: 0 };
          flashAt = sceneT;
          audio.click();
          announce(ac.gearDown ? 'Gear down.' : 'Gear up.');
        }
      }
      return;
    }
    if (screen === 'pause') {
      if (actions & (ACTION_PAUSE | ACTION_CONFIRM)) {
        screen = 'play';
        announce('Flying.');
      } else if (actions & ACTION_RESTART) startSortie();
      return;
    }
    if (screen === 'results') {
      if (actions & (ACTION_CONFIRM | ACTION_RESTART)) startSortie();
    }
  }

  /** Turn a step's events into sound, flashes and announcements. */
  function react(events) {
    if (events & EVENT_RING) {
      audio.chime();
      flash = { text: `+${ac.lastRingPoints} · RING ${ac.ringsPassed} OF ${world.rings.length}`, age: 0 };
      flashAt = sceneT;
      announce(`Ring ${ac.ringsPassed} of ${world.rings.length}. ${ac.lastRingPoints} points.`);
    }
    if (events & EVENT_LIFTOFF) {
      flash = { text: 'AIRBORNE', age: 0 };
      flashAt = sceneT;
      announce('Airborne.');
    }
    if (events & EVENT_LANDED) {
      const hardness = { SMOOTH: 0.15, FIRM: 0.45, HARD: 0.85, ROUGH: 0.65 }[ac.result.grade] ?? 0.5;
      audio.thud(hardness);
      screen = 'results';
      announce(`Down. Landing ${ac.result.grade}. Total score ${ac.result.total}.`);
    }
    if (events & EVENT_CRASH) {
      audio.crash();
      screen = 'results';
      announce(`Crashed. ${ac.result.note} Score ${ac.result.total}.`);
    }
  }

  function frame(now) {
    requestAnimationFrame(frame);
    const frameSeconds = Math.min((now - last) / 1000, MAX_FRAME);
    last = now;
    sceneT += frameSeconds;
    handleActions();

    if (screen === 'title' || screen === 'briefing') {
      accumulator += frameSeconds;
      while (accumulator >= STEP) {
        stepAircraft(attractAc, world, STEP, pilotInput(pilot, world, attractAc));
        accumulator -= STEP;
      }
      // However the show flight ends, a fresh one is already taxiing out behind the title.
      if (attractAc.phase === 'done') {
        attractAc = createAircraft(world);
        pilot = createPilot();
      }
      paintFlight(world, attractAc, 'chase', sceneT, null, false);
      const { ctx, width: W, height: H } = renderer;
      if (screen === 'title') drawTitle(ctx, W, H, sceneT);
      else drawBriefing(ctx, W, H);
      audio.update(attractAc, true);
      return;
    }

    if (screen === 'play') {
      accumulator += frameSeconds;
      const axes = input.axes();
      while (accumulator >= STEP && screen === 'play') {
        react(stepAircraft(ac, world, STEP, axes));
        accumulator -= STEP;
      }
      if (ac.stalled && sceneT - lastWarble > 0.6) {
        audio.warble();
        lastWarble = sceneT;
      }
    } else {
      accumulator = 0;
    }

    if (flash) flash.age = sceneT - flashAt;
    paintFlight(world, ac, view, sceneT, flash);
    const { ctx, width: W, height: H } = renderer;
    if (screen === 'pause') drawPause(ctx, W, H);
    if (screen === 'results') drawResults(ctx, W, H, ac);
    audio.update(ac, screen === 'play');
  }

  // Leaving the tab pauses a running flight rather than letting it fly unseen.
  document.addEventListener('visibilitychange', () => {
    if (document.hidden && screen === 'play') {
      screen = 'pause';
      announce('Paused.');
    }
  });

  announce('SKYHAUL. Press Enter for the flight briefing.');
  requestAnimationFrame(frame);
}

if (shot) runShot(shot);
else runGame();
