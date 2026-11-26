// The head-up display and the screens. The HUD is what both views share: altitude, speed and
// heading always in the pilot's eye, the score and the rings still to fly, a guide arrow that
// points at the next ring (or home, when the rings are done), the throttle and gear state, and
// the centre messages a pilot must not miss — STALL above all. Around the flight sit the four
// screens: the title over its attract flight, the briefing with the controls, pause, and the
// results with the score broken down the way it was earned.

import { M_TO_FT, MS_TO_KT, PLANE } from './config.js';
import { angleDelta, clamp } from './random.js';
import { aboveGround } from './aircraft.js';

const MONO = "ui-monospace, 'SF Mono', Menlo, Consolas, monospace";
const INK = '#eef3f6';
const DIM = 'rgba(210,222,232,0.72)';
const GOLD = '#ffc844';
const RED = '#ff5147';
const AMBER = '#ffb84d';
const GREEN = '#58e08a';

function text(ctx, str, x, y, size, color, align = 'left', weight = 'bold') {
  ctx.fillStyle = color;
  ctx.font = `${weight} ${size}px ${MONO}`;
  ctx.textAlign = align;
  ctx.textBaseline = 'middle';
  ctx.fillText(str, x, y);
}

/** A translucent dark plate behind a block of readouts, so they read against any sky. */
function plate(ctx, x, y, w, h) {
  ctx.fillStyle = 'rgba(10,16,24,0.55)';
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, 10);
  ctx.fill();
  ctx.strokeStyle = 'rgba(190,215,235,0.18)';
  ctx.lineWidth = 1;
  ctx.stroke();
}

function formatTime(seconds) {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

function headingDeg(ac) {
  return ((ac.heading * 180 / Math.PI) % 360 + 360) % 360;
}

/**
 * The HUD for one frame of flight. `flash` is an optional { text, age } centre announcement
 * (a ring scored, a liftoff) that fades as its age grows past a second and a half.
 */
export function drawHUD(ctx, W, H, ac, world, view, t, flash) {
  const altFt = Math.max(0, Math.round(ac.y * M_TO_FT));
  const kt = Math.round(ac.speed * MS_TO_KT);

  // Left: the three numbers no pilot flies without.
  plate(ctx, 14, 14, 316, 64);
  text(ctx, 'ALT', 30, 34, 12, DIM);
  text(ctx, `${altFt} FT`, 30, 58, 23, INK);
  text(ctx, 'SPD', 140, 34, 12, DIM);
  text(ctx, `${kt} KT`, 140, 58, 23, INK);
  text(ctx, 'HDG', 238, 34, 12, DIM);
  text(ctx, `${String(Math.round(headingDeg(ac))).padStart(3, '0')}°`, 238, 58, 23, INK);

  // Right: the state of the sortie — score, rings, clock.
  plate(ctx, W - 330, 14, 316, 64);
  text(ctx, 'SCORE', W - 314, 34, 12, DIM);
  text(ctx, String(ac.score).padStart(4, '0'), W - 314, 58, 23, GOLD);
  text(ctx, 'RINGS', W - 196, 34, 12, DIM);
  for (let i = 0; i < world.rings.length; i++) {
    ctx.beginPath();
    ctx.arc(W - 190 + i * 15.5, 59, 5.5, 0, Math.PI * 2);
    if (i < ac.ringsPassed) {
      ctx.fillStyle = GREEN;
      ctx.fill();
    } else if (i === ac.ringsPassed) {
      ctx.strokeStyle = GOLD;
      ctx.lineWidth = 2.5;
      ctx.stroke();
    } else {
      ctx.strokeStyle = 'rgba(200,215,228,0.4)';
      ctx.lineWidth = 1.5;
      ctx.stroke();
    }
  }
  text(ctx, formatTime(ac.time), W - 30, 34, 15, INK, 'right');

  // The guide: an arrow over the top centre, swung toward the next ring or the runway home.
  const target = world.rings[ac.ringsPassed];
  const tx = target ? target.x : world.runway.cx;
  const tz = target ? target.z : (world.runway.zNorth + world.runway.zSouth) / 2;
  const bearing = Math.atan2(tx - ac.x, -(tz - ac.z));
  const rel = angleDelta(ac.heading, bearing);
  const dist = Math.hypot(tx - ac.x, tz - ac.z);
  const gx = W / 2, gy = 46;
  ctx.save();
  ctx.translate(gx, gy);
  ctx.rotate(clamp(rel, -1.1, 1.1));
  ctx.fillStyle = target ? GOLD : GREEN;
  ctx.beginPath();
  ctx.moveTo(0, -13);
  ctx.lineTo(8, 8);
  ctx.lineTo(0, 3);
  ctx.lineTo(-8, 8);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
  const distText = dist >= 1000 ? `${(dist / 1000).toFixed(1)} KM` : `${Math.round(dist)} M`;
  text(ctx, target ? `RING ${ac.ringsPassed + 1} · ${distText}` : `RUNWAY · ${distText}`, gx, gy + 30, 14, target ? GOLD : GREEN, 'center');

  // Chase view only (the cockpit has its own quadrant): throttle, gear and fuel, bottom left.
  if (view === 'chase') {
    plate(ctx, 14, H - 118, 148, 104);
    text(ctx, 'THR', 28, H - 96, 11, DIM);
    text(ctx, `${Math.round(ac.throttle * 100)}%`, 148, H - 96, 13, INK, 'right');
    ctx.fillStyle = 'rgba(255,255,255,0.14)';
    ctx.fillRect(28, H - 84, 120, 9);
    ctx.fillStyle = GOLD;
    ctx.fillRect(28, H - 84, 120 * ac.throttle, 9);
    text(ctx, ac.gearDown ? 'GEAR ▼ DOWN' : 'GEAR ▲ UP', 28, H - 56, 13, ac.gearDown ? GREEN : RED);
    text(ctx, 'FUEL', 28, H - 34, 11, DIM);
    ctx.fillStyle = 'rgba(255,255,255,0.14)';
    ctx.fillRect(66, H - 39, 82, 9);
    const fuelFrac = clamp(ac.fuel / PLANE.fuelCapacity, 0, 1);
    ctx.fillStyle = fuelFrac > 0.25 ? GREEN : fuelFrac > 0.1 ? AMBER : RED;
    ctx.fillRect(66, H - 39, 82 * fuelFrac, 9);
  }

  if (view === 'chase') {
    text(ctx, 'V VIEW · G GEAR · P PAUSE · M SOUND', W - 16, H - 18, 11, 'rgba(215,228,238,0.5)', 'right', 'normal');
  }

  // Centre messages, in the order a pilot would want them: the stall owns the screen.
  let message = null;
  let messageColor = RED;
  let messageFlash = true;
  if (ac.stalled && ac.phase === 'air') message = 'STALL';
  else if (ac.phase === 'air' && aboveGround(ac, world) < 130 && ac.vy < -3.5) { message = 'PULL UP'; messageColor = AMBER; }
  else if (ac.engineOut) { message = 'ENGINE OUT — GLIDE HOME'; messageColor = AMBER; messageFlash = false; }
  else if (ac.phase === 'air' && !ac.gearDown && aboveGround(ac, world) < 220) { message = 'GEAR UP'; messageColor = AMBER; }
  else if (ac.fuel < PLANE.fuelCapacity * 0.15 && ac.phase === 'air') { message = 'LOW FUEL'; messageColor = AMBER; messageFlash = false; }
  if (message && (!messageFlash || (t * 4) % 2 < 1.55)) {
    text(ctx, message, W / 2, H * 0.3, 34, messageColor, 'center');
  }

  // The passing flash: points just scored, already fading.
  if (flash && flash.age < 1.6) {
    ctx.save();
    ctx.globalAlpha = clamp(1.6 - flash.age, 0, 1);
    text(ctx, flash.text, W / 2, H * 0.38, 26, GOLD, 'center');
    ctx.restore();
  }
}

/** A soft dark veil over the scene, for the screens that sit on top of the flight. */
function veil(ctx, W, H, alphaTop = 0.25, alphaBottom = 0.55) {
  const grad = ctx.createLinearGradient(0, 0, 0, H);
  grad.addColorStop(0, `rgba(6,10,16,${alphaTop})`);
  grad.addColorStop(1, `rgba(6,10,16,${alphaBottom})`);
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, W, H);
}

/** The title screen, over the autopilot's attract flight. */
export function drawTitle(ctx, W, H, t) {
  veil(ctx, W, H, 0.12, 0.5);
  text(ctx, 'S K Y H A U L', W / 2, H * 0.3, Math.min(92, W * 0.085), INK, 'center');
  text(ctx, 'ISLAND FREIGHT RUN', W / 2, H * 0.3 + Math.min(92, W * 0.085) * 0.72, 20, GOLD, 'center');
  text(ctx, 'Seven rings. One narrow strip. Bring her home.', W / 2, H * 0.52, 19, DIM, 'center', 'normal');
  if ((t * 1.4) % 2 < 1.5) {
    text(ctx, 'PRESS ENTER — FLIGHT BRIEFING', W / 2, H * 0.66, 21, INK, 'center');
  }
  text(ctx, 'a hand-built flight game · keyboard & mouse · sound on M', W / 2, H - 26, 12, 'rgba(215,228,238,0.55)', 'center', 'normal');
}

/** The briefing: the mission, the controls and the scoring, on one panel. */
export function drawBriefing(ctx, W, H) {
  veil(ctx, W, H, 0.55, 0.65);
  const pw = Math.min(780, W * 0.9);
  const ph = Math.min(560, H * 0.88);
  const px = (W - pw) / 2;
  const py = (H - ph) / 2;
  ctx.fillStyle = 'rgba(13,19,27,0.92)';
  ctx.beginPath();
  ctx.roundRect(px, py, pw, ph, 14);
  ctx.fill();
  ctx.strokeStyle = 'rgba(255,200,68,0.4)';
  ctx.lineWidth = 1.5;
  ctx.stroke();
  let y = py + 44;
  text(ctx, 'FLIGHT BRIEFING', px + pw / 2, y, 27, GOLD, 'center');
  y += 40;
  text(ctx, 'Take off north. Thread the seven glowing rings in order — a pass through', px + pw / 2, y, 15.5, INK, 'center', 'normal');
  y += 22;
  text(ctx, 'the centre pays double — then come home and land on the strip you left.', px + pw / 2, y, 15.5, INK, 'center', 'normal');
  y += 24;
  text(ctx, 'Smooth landing: +300 · Firm: +200 · Hard: +100 · The clock costs 1 a second past 4:00.', px + pw / 2, y, 13.5, DIM, 'center', 'normal');
  y += 20;
  text(ctx, 'Fuel is six minutes at full throttle. The wing stalls below 47 knots — slower in a turn.', px + pw / 2, y, 13.5, DIM, 'center', 'normal');

  const controls = [
    ['↑ / W · ↓ / S', 'stick — nose up / down'],
    ['← / → · A / D', 'bank and turn'],
    ['SHIFT / CTRL', 'throttle up / down (or PgUp / PgDn)'],
    ['G', 'landing gear up / down'],
    ['V', 'cockpit / chase view'],
    ['P · M · R', 'pause · sound · restart'],
    ['MOUSE', 'steer from the pointer, if you prefer'],
  ];
  y += 38;
  for (const [keys, what] of controls) {
    text(ctx, keys, px + pw * 0.16, y, 15, GOLD, 'left');
    text(ctx, what, px + pw * 0.44, y, 15, INK, 'left', 'normal');
    y += 27;
  }
  y += 16;
  text(ctx, 'ENTER — START ENGINE', px + pw / 2, y, 19, GREEN, 'center');
  text(ctx, 'ESC — BACK', px + pw / 2, y + 28, 12.5, DIM, 'center', 'normal');
}

/** The pause screen: the flight, held. */
export function drawPause(ctx, W, H) {
  veil(ctx, W, H, 0.45, 0.45);
  text(ctx, 'PAUSED', W / 2, H * 0.44, 40, INK, 'center');
  text(ctx, 'P — FLY ON · R — RESTART THE SORTIE', W / 2, H * 0.44 + 46, 15, DIM, 'center', 'normal');
}

/** The results screen: what the flight earned, line by line, and the grade it flew to. */
export function drawResults(ctx, W, H, ac) {
  veil(ctx, W, H, 0.5, 0.68);
  const r = ac.result;
  const pw = Math.min(620, W * 0.88);
  const ph = 430;
  const px = (W - pw) / 2;
  const py = (H - ph) / 2;
  ctx.fillStyle = 'rgba(13,19,27,0.93)';
  ctx.beginPath();
  ctx.roundRect(px, py, pw, ph, 14);
  ctx.fill();
  ctx.strokeStyle = r.kind === 'landed' ? 'rgba(88,224,138,0.45)' : 'rgba(255,81,71,0.5)';
  ctx.lineWidth = 1.5;
  ctx.stroke();
  let y = py + 46;
  if (r.kind === 'landed') {
    text(ctx, 'FLIGHT COMPLETE', px + pw / 2, y, 27, GREEN, 'center');
    y += 62;
    text(ctx, r.letter, px + pw / 2, y, 74, GOLD, 'center');
    y += 52;
    text(ctx, `LANDING: ${r.grade}`, px + pw / 2, y, 18, INK, 'center');
  } else {
    text(ctx, 'AIRCRAFT DOWN', px + pw / 2, y, 27, RED, 'center');
    y += 62;
    text(ctx, '✕', px + pw / 2, y, 64, RED, 'center');
    y += 52;
    text(ctx, 'THE SORTIE IS OVER', px + pw / 2, y, 18, INK, 'center');
  }
  y += 26;
  text(ctx, r.note, px + pw / 2, y, 14.5, DIM, 'center', 'normal');
  y += 38;
  const rows = [
    [`Rings — ${ac.ringsPassed} of 7${ac.ringScores.length ? ` (${ac.ringScores.join(' + ')})` : ''}`, r.ringPoints],
    ['Landing bonus', r.landingBonus],
    ['Time penalty', r.timePenalty ? -r.timePenalty : 0],
  ];
  for (const [label, value] of rows) {
    text(ctx, label, px + 56, y, 15.5, INK, 'left', 'normal');
    text(ctx, String(value), px + pw - 56, y, 15.5, INK, 'right');
    y += 26;
  }
  ctx.strokeStyle = 'rgba(200,215,228,0.25)';
  ctx.beginPath();
  ctx.moveTo(px + 56, y - 6);
  ctx.lineTo(px + pw - 56, y - 6);
  ctx.stroke();
  text(ctx, 'TOTAL', px + 56, y + 12, 17, GOLD, 'left');
  text(ctx, String(r.total), px + pw - 56, y + 12, 20, GOLD, 'right');
  if (r.kind === 'landed' && !r.complete) {
    text(ctx, 'Course incomplete — the rings left unflown paid nothing.', px + pw / 2, y + 42, 13, AMBER, 'center', 'normal');
  }
  text(ctx, 'R / ENTER — FLY AGAIN', px + pw / 2, py + ph - 28, 16, GREEN, 'center');
}
