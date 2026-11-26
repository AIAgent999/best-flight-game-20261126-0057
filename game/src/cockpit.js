// The cockpit: what the pilot sees in cockpit view. A canopy frame and glareshield around the
// renderer's world, and below them a panel of working instruments, all drawn from the
// aeroplane's live state — an attitude indicator whose horizon rolls and slides with the
// aeroplane, airspeed and altimeter dials, a compass strip, a vertical-speed indicator, a
// throttle quadrant, a fuel gauge, and the warning lights: STALL, GEAR and FUEL, lit when true.

import { M_TO_FT, MS_TO_KT, PLANE } from './config.js';
import { clamp } from './random.js';
import { stallSpeedNow } from './aircraft.js';

const PANEL = '#20242b';
const PANEL_LOW = '#14171c';
const FACE = '#101318';
const RIM = '#454e59';
const CREAM = '#e8e4d8';
const AMBER = '#ffb84d';
const RED = '#ff5147';
const GREEN = '#58e08a';

/** A round gauge's bare face: dark glass, a rim, and a soft top-light reflection. */
function gaugeFace(ctx, cx, cy, r) {
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.fillStyle = FACE;
  ctx.fill();
  ctx.lineWidth = Math.max(2, r * 0.07);
  ctx.strokeStyle = RIM;
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(cx, cy - r * 0.18, r * 0.72, Math.PI * 1.05, Math.PI * 1.5);
  ctx.strokeStyle = 'rgba(200,225,250,0.13)';
  ctx.lineWidth = r * 0.16;
  ctx.stroke();
}

/** The needle of a gauge, pointing along `angle` (canvas radians, 0 = east, clockwise). */
function needle(ctx, cx, cy, angle, len, width, color = CREAM) {
  ctx.beginPath();
  ctx.moveTo(cx - Math.cos(angle) * len * 0.18, cy - Math.sin(angle) * len * 0.18);
  ctx.lineTo(cx + Math.cos(angle) * len, cy + Math.sin(angle) * len);
  ctx.strokeStyle = color;
  ctx.lineWidth = width;
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(cx, cy, width * 1.1, 0, Math.PI * 2);
  ctx.fillStyle = '#2c3138';
  ctx.fill();
}

/** A gauge whose scale sweeps 270 degrees, from down-left (0) through up to down-right (max). */
function sweepAngle(frac) {
  return Math.PI * (0.75 + 1.5 * clamp(frac, 0, 1));
}

/** Ticks and numbers around a sweep gauge: `marks` are [fraction, label] pairs. */
function sweepTicks(ctx, cx, cy, r, marks, labelEvery = 1) {
  ctx.fillStyle = CREAM;
  ctx.strokeStyle = CREAM;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  marks.forEach(([frac, label], i) => {
    const a = sweepAngle(frac);
    const c = Math.cos(a), s = Math.sin(a);
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(cx + c * r * 0.86, cy + s * r * 0.86);
    ctx.lineTo(cx + c * r * 0.97, cy + s * r * 0.97);
    ctx.stroke();
    if (label !== '' && i % labelEvery === 0) {
      ctx.font = `bold ${Math.round(r * 0.21)}px ui-monospace, Menlo, Consolas, monospace`;
      ctx.fillText(label, cx + c * r * 0.66, cy + s * r * 0.66);
    }
  });
}

/** The attitude indicator: the world in miniature, rolling and sliding with the aeroplane. */
function drawAttitude(ctx, cx, cy, r, ac) {
  ctx.save();
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.clip();
  ctx.translate(cx, cy);
  ctx.rotate(-ac.roll);
  const pitchPx = clamp(ac.pitch, -0.5, 0.5) * (r / 0.35);
  ctx.translate(0, pitchPx);
  ctx.fillStyle = '#3d7dc4';
  ctx.fillRect(-r * 1.6, -r * 1.6, r * 3.2, r * 1.6);
  ctx.fillStyle = '#8a6844';
  ctx.fillRect(-r * 1.6, 0, r * 3.2, r * 1.6);
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = 2.5;
  ctx.beginPath();
  ctx.moveTo(-r * 1.6, 0);
  ctx.lineTo(r * 1.6, 0);
  ctx.stroke();
  // The pitch ladder: rungs every ten degrees, wider at twenty.
  ctx.lineWidth = 2;
  for (const deg of [-20, -10, 10, 20]) {
    const y = -deg * (Math.PI / 180) * (r / 0.35);
    const w = r * (Math.abs(deg) === 20 ? 0.42 : 0.26);
    ctx.beginPath();
    ctx.moveTo(-w, y);
    ctx.lineTo(w, y);
    ctx.stroke();
  }
  ctx.restore();
  // The rim alone: gaugeFace's dark fill would bury the little world just drawn.
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.lineWidth = Math.max(2, r * 0.07);
  ctx.strokeStyle = RIM;
  ctx.stroke();
  // The fixed aeroplane symbol the horizon moves behind.
  ctx.strokeStyle = '#ffd34d';
  ctx.lineWidth = Math.max(3, r * 0.07);
  ctx.beginPath();
  ctx.moveTo(cx - r * 0.62, cy);
  ctx.lineTo(cx - r * 0.2, cy);
  ctx.lineTo(cx - r * 0.2, cy + r * 0.14);
  ctx.moveTo(cx + r * 0.62, cy);
  ctx.lineTo(cx + r * 0.2, cy);
  ctx.lineTo(cx + r * 0.2, cy + r * 0.14);
  ctx.stroke();
  ctx.fillStyle = '#ffd34d';
  ctx.beginPath();
  ctx.arc(cx, cy, r * 0.05, 0, Math.PI * 2);
  ctx.fill();
  label(ctx, cx, cy + r * 1.18, 'ATTITUDE', r);
}

/** Small upright label under a gauge. */
function label(ctx, x, y, text, r) {
  ctx.fillStyle = 'rgba(210,216,224,0.6)';
  ctx.font = `bold ${Math.max(9, Math.round(r * 0.17))}px ui-monospace, Menlo, Consolas, monospace`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, x, y);
}

/** The airspeed indicator, knots, with the green arc of the flying speeds. */
function drawAirspeed(ctx, cx, cy, r, ac) {
  gaugeFace(ctx, cx, cy, r);
  const kt = ac.speed * MS_TO_KT;
  // The green arc: from just above the stall to the top of the cruising band.
  ctx.beginPath();
  ctx.arc(cx, cy, r * 0.8, sweepAngle((stallSpeedNow(ac) * MS_TO_KT) / 140), sweepAngle(115 / 140));
  ctx.strokeStyle = 'rgba(88,224,138,0.75)';
  ctx.lineWidth = r * 0.09;
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(cx, cy, r * 0.8, sweepAngle(115 / 140), sweepAngle(1));
  ctx.strokeStyle = 'rgba(255,81,71,0.8)';
  ctx.stroke();
  const marks = [];
  for (let v = 0; v <= 140; v += 20) marks.push([v / 140, String(v)]);
  sweepTicks(ctx, cx, cy, r, marks);
  needle(ctx, cx, cy, sweepAngle(kt / 140), r * 0.78, Math.max(2.5, r * 0.06));
  label(ctx, cx, cy + r * 1.18, 'AIRSPEED · KT', r);
}

/** The altimeter: a needle that turns once per thousand feet, and the number itself below it. */
function drawAltimeter(ctx, cx, cy, r, ac) {
  gaugeFace(ctx, cx, cy, r);
  const ft = Math.max(0, ac.y * M_TO_FT);
  ctx.fillStyle = CREAM;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  for (let i = 0; i < 10; i++) {
    const a = -Math.PI / 2 + (i / 10) * Math.PI * 2;
    const c = Math.cos(a), s = Math.sin(a);
    ctx.strokeStyle = CREAM;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(cx + c * r * 0.86, cy + s * r * 0.86);
    ctx.lineTo(cx + c * r * 0.97, cy + s * r * 0.97);
    ctx.stroke();
    ctx.font = `bold ${Math.round(r * 0.22)}px ui-monospace, Menlo, Consolas, monospace`;
    ctx.fillText(String(i), cx + c * r * 0.64, cy + s * r * 0.64);
  }
  const frac = (ft % 1000) / 1000;
  needle(ctx, cx, cy, -Math.PI / 2 + frac * Math.PI * 2, r * 0.8, Math.max(2.5, r * 0.06));
  // The digital window: the exact height, for approaches flown on the number.
  ctx.fillStyle = '#05070a';
  ctx.fillRect(cx - r * 0.42, cy + r * 0.3, r * 0.84, r * 0.3);
  ctx.fillStyle = '#9fe8ff';
  ctx.font = `bold ${Math.round(r * 0.24)}px ui-monospace, Menlo, Consolas, monospace`;
  ctx.fillText(String(Math.round(ft)).padStart(4, '0'), cx, cy + r * 0.46);
  label(ctx, cx, cy + r * 1.18, 'ALTIMETER · FT', r);
}

/** The vertical-speed indicator, in hundreds of feet per minute, up or down. */
function drawVsi(ctx, cx, cy, r, ac) {
  gaugeFace(ctx, cx, cy, r);
  const fpm = clamp(ac.vy * 196.85, -2000, 2000);
  const marks = [[0, '20'], [0.125, '10'], [0.25, '5'], [0.375, ''], [0.5, '0'], [0.625, ''], [0.75, '5'], [0.875, '10'], [1, '20']];
  sweepTicks(ctx, cx, cy, r, marks);
  needle(ctx, cx, cy, sweepAngle((fpm + 2000) / 4000), r * 0.76, Math.max(2, r * 0.06));
  label(ctx, cx, cy + r * 1.18, 'VERT SPEED', r);
}

/** The compass strip: a scrolling tape of headings under a fixed caret, on the glareshield. */
function drawCompass(ctx, cx, cy, w, ac) {
  const h = 34;
  ctx.fillStyle = '#0b0e12';
  ctx.fillRect(cx - w / 2, cy - h / 2, w, h);
  ctx.strokeStyle = RIM;
  ctx.lineWidth = 1.5;
  ctx.strokeRect(cx - w / 2, cy - h / 2, w, h);
  const headingDeg = ((ac.heading * 180 / Math.PI) % 360 + 360) % 360;
  const pxPerDeg = 4.4;
  ctx.save();
  ctx.beginPath();
  ctx.rect(cx - w / 2, cy - h / 2, w, h);
  ctx.clip();
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  for (let off = -60; off <= 60; off += 5) {
    const deg = ((Math.round(headingDeg + off) % 360) + 360) % 360;
    const snapped = Math.round((headingDeg + off) / 5) * 5;
    const shown = ((snapped % 360) + 360) % 360;
    const x = cx + off * pxPerDeg;
    if (shown % 30 === 0) {
      const card = { 0: 'N', 90: 'E', 180: 'S', 270: 'W' }[shown];
      ctx.fillStyle = card ? '#ffd34d' : CREAM;
      ctx.font = `bold ${card ? 17 : 13}px ui-monospace, Menlo, Consolas, monospace`;
      ctx.fillText(card ?? String(shown / 10).padStart(2, '0'), x, cy);
    } else {
      ctx.fillStyle = 'rgba(232,228,216,0.6)';
      ctx.fillRect(x - 1, cy - 6, 2, 12);
    }
    void deg;
  }
  ctx.restore();
  // The caret and the exact heading, boxed in amber.
  ctx.fillStyle = RED;
  ctx.beginPath();
  ctx.moveTo(cx - 6, cy - h / 2 - 1);
  ctx.lineTo(cx + 6, cy - h / 2 - 1);
  ctx.lineTo(cx, cy - h / 2 + 8);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = '#05070a';
  ctx.fillRect(cx - 24, cy + h / 2 + 3, 48, 20);
  ctx.fillStyle = AMBER;
  ctx.font = 'bold 14px ui-monospace, Menlo, Consolas, monospace';
  ctx.textAlign = 'center';
  ctx.fillText(`${String(Math.round(headingDeg)).padStart(3, '0')}°`, cx, cy + h / 2 + 14);
}

/** One warning light: bright and glowing when lit, a dark ghost of itself when not. */
function drawLight(ctx, x, y, w, h, text, color, lit, t, flash = false) {
  const on = lit && (!flash || (t * 5) % 2 < 1.5);
  ctx.save();
  if (on) {
    ctx.shadowColor = color;
    ctx.shadowBlur = 16;
  }
  ctx.fillStyle = on ? color : '#1a1e24';
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, 5);
  ctx.fill();
  ctx.restore();
  ctx.fillStyle = on ? '#14100a' : 'rgba(200,205,212,0.35)';
  ctx.font = `bold ${Math.round(h * 0.52)}px ui-monospace, Menlo, Consolas, monospace`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, x + w / 2, y + h / 2 + 1);
}

/** The throttle quadrant: a slot, a lever that sits where the throttle is, and the number. */
function drawThrottle(ctx, x, y, w, h, ac) {
  ctx.fillStyle = '#171a1f';
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, 8);
  ctx.fill();
  ctx.strokeStyle = RIM;
  ctx.lineWidth = 1.5;
  ctx.stroke();
  const slotX = x + w / 2;
  const top = y + 26;
  const bottom = y + h - 30;
  ctx.strokeStyle = '#05070a';
  ctx.lineWidth = 7;
  ctx.beginPath();
  ctx.moveTo(slotX, top);
  ctx.lineTo(slotX, bottom);
  ctx.stroke();
  const ly = bottom - ac.throttle * (bottom - top);
  ctx.fillStyle = '#c8ccd2';
  ctx.beginPath();
  ctx.roundRect(slotX - 17, ly - 10, 34, 20, 6);
  ctx.fill();
  ctx.fillStyle = '#22262c';
  ctx.beginPath();
  ctx.roundRect(slotX - 17, ly - 10, 34, 8, 5);
  ctx.fill();
  ctx.fillStyle = 'rgba(210,216,224,0.65)';
  ctx.font = 'bold 11px ui-monospace, Menlo, Consolas, monospace';
  ctx.textAlign = 'center';
  ctx.fillText('THROTTLE', slotX, y + 14);
  ctx.fillStyle = AMBER;
  ctx.font = 'bold 15px ui-monospace, Menlo, Consolas, monospace';
  ctx.fillText(`${Math.round(ac.throttle * 100)}%`, slotX, y + h - 12);
}

/** The fuel gauge: a vertical tank that empties as the flight burns, changing colour as it goes. */
function drawFuel(ctx, x, y, w, h, ac, t) {
  ctx.fillStyle = '#171a1f';
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, 8);
  ctx.fill();
  ctx.strokeStyle = RIM;
  ctx.lineWidth = 1.5;
  ctx.stroke();
  const frac = clamp(ac.fuel / PLANE.fuelCapacity, 0, 1);
  const innerH = h - 44;
  const color = frac > 0.25 ? GREEN : frac > 0.1 ? AMBER : RED;
  ctx.fillStyle = '#05070a';
  ctx.fillRect(x + 8, y + 24, w - 16, innerH);
  if (frac > 0.1 || (t * 4) % 2 < 1.4) {
    ctx.fillStyle = color;
    ctx.fillRect(x + 8, y + 24 + innerH * (1 - frac), w - 16, innerH * frac);
  }
  ctx.fillStyle = 'rgba(210,216,224,0.65)';
  ctx.font = 'bold 11px ui-monospace, Menlo, Consolas, monospace';
  ctx.textAlign = 'center';
  ctx.fillText('FUEL', x + w / 2, y + 13);
  ctx.fillStyle = color;
  ctx.font = 'bold 13px ui-monospace, Menlo, Consolas, monospace';
  ctx.fillText(`${Math.round(frac * 100)}%`, x + w / 2, y + h - 9);
}

/**
 * Draw the whole cockpit over the scene: frame, glareshield, panel and instruments.
 * Called after the renderer's scene whenever the view is the cockpit.
 */
export function drawCockpit(ctx, W, H, ac, t) {
  // Canopy pillars and the top brow: the airframe around the glass.
  ctx.fillStyle = '#151920';
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.lineTo(W * 0.07, 0);
  ctx.lineTo(W * 0.175, H * 0.7);
  ctx.lineTo(0, H * 0.8);
  ctx.closePath();
  ctx.fill();
  ctx.beginPath();
  ctx.moveTo(W, 0);
  ctx.lineTo(W * 0.93, 0);
  ctx.lineTo(W * 0.825, H * 0.7);
  ctx.lineTo(W, H * 0.8);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = '#11141a';
  ctx.fillRect(0, 0, W, H * 0.038);
  // A breath of glass: one faint diagonal reflection.
  ctx.fillStyle = 'rgba(220,238,252,0.045)';
  ctx.beginPath();
  ctx.moveTo(W * 0.3, 0);
  ctx.lineTo(W * 0.46, 0);
  ctx.lineTo(W * 0.24, H * 0.68);
  ctx.lineTo(W * 0.12, H * 0.68);
  ctx.closePath();
  ctx.fill();

  // The panel: a shallow curve of dark metal across the bottom of the view.
  const panelTop = H * 0.7;
  const grad = ctx.createLinearGradient(0, panelTop, 0, H);
  grad.addColorStop(0, '#262b33');
  grad.addColorStop(0.12, PANEL);
  grad.addColorStop(1, PANEL_LOW);
  ctx.fillStyle = grad;
  ctx.beginPath();
  ctx.moveTo(0, panelTop + H * 0.035);
  ctx.quadraticCurveTo(W / 2, panelTop - H * 0.018, W, panelTop + H * 0.035);
  ctx.lineTo(W, H);
  ctx.lineTo(0, H);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = 'rgba(190,205,220,0.16)';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(0, panelTop + H * 0.035);
  ctx.quadraticCurveTo(W / 2, panelTop - H * 0.018, W, panelTop + H * 0.035);
  ctx.stroke();

  drawCompass(ctx, W / 2, panelTop + 2, Math.min(360, W * 0.3), ac);

  // The warning lights, in a row on the panel's brow.
  const lw = Math.min(96, W * 0.082);
  const lh = 24;
  const ly = panelTop + H * 0.045;
  const lx = W / 2 - lw * 1.72;
  drawLight(ctx, lx, ly, lw, lh, 'STALL', RED, ac.stalled, t, true);
  drawLight(ctx, lx + lw * 1.18, ly, lw, lh, ac.gearDown ? 'GEAR DN' : 'GEAR UP', ac.gearDown ? GREEN : RED, true, t, !ac.gearDown);
  drawLight(ctx, lx + lw * 2.36, ly, lw, lh, 'FUEL', AMBER, ac.fuel < PLANE.fuelCapacity * 0.25, t, ac.fuel < PLANE.fuelCapacity * 0.1);

  // The gauges: airspeed, attitude, altimeter, vertical speed, in a row.
  const R = Math.min(H * 0.105, W * 0.052);
  const gy = H * 0.875;
  drawAirspeed(ctx, W * 0.285, gy, R, ac);
  drawAttitude(ctx, W * 0.415, gy, R * 1.06, ac);
  drawAltimeter(ctx, W * 0.545, gy, R, ac);
  drawVsi(ctx, W * 0.655, gy, R * 0.8, ac);

  // Throttle and fuel, to the right where the pilot's hand expects them.
  drawThrottle(ctx, W * 0.775, H * 0.755, W * 0.062, H * 0.225, ac);
  drawFuel(ctx, W * 0.862, H * 0.755, W * 0.05, H * 0.225, ac, t);
}
