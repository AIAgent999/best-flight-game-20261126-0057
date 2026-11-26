// The renderer: SKYHAUL's world drawn with a hand-rolled perspective projection on a 2D canvas —
// no libraries, no images, every polygon placed by the same camera maths. The ground is the
// island's own data (field cells at their true heights, the river and roads as ribbons, the
// runway, cone mountains, box houses, cone trees, billboard clouds), drawn far to near, and the
// aeroplane in chase view is a stylised low-poly drawing that banks and nods with the controls.
// What the screenshot scenes photograph is exactly this, frozen.

import { clamp, lerp } from './random.js';
import { RUNWAY, coastX } from './terrain.js';

/** Haze colour: everything far away fades toward it. */
const HAZE = [203, 226, 240];
/** The sun's direction (toward the sun): a warm north-western afternoon. */
const SUN = (() => {
  const v = [-0.5, 0.55, -0.66];
  const len = Math.hypot(...v);
  return v.map((n) => n / len);
})();
/** How close a point may be to the camera before its polygon is clipped, in metres. */
const NEAR = 1.2;
/** How far the renderer bothers with ground detail, in metres. */
const VIEW_DIST = 3400;

const css = (rgb, a = 1) => `rgba(${rgb[0] | 0},${rgb[1] | 0},${rgb[2] | 0},${a})`;
const mix = (a, b, t) => [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)];
/** A colour lit by `light` and hazed by distance: the renderer's one shading habit. */
const shade = (rgb, light, hazeF) => css(mix(mix(rgb, [0, 0, 0], 1 - light), HAZE, hazeF));
const hazeOf = (dist) => clamp((dist - 1100) / 3000, 0, 0.82);

export function createRenderer(canvas) {
  const ctx = canvas.getContext('2d');
  let W = 0;
  let H = 0;
  // The camera, rebuilt each frame: position, basis vectors and focal length in pixels.
  let cam = null;

  function resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = canvas.clientWidth;
    const h = canvas.clientHeight;
    if (w === 0 || h === 0) return;
    if (canvas.width !== Math.round(w * dpr) || canvas.height !== Math.round(h * dpr)) {
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
    }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    W = w;
    H = h;
  }

  /** Place the camera: yaw/pitch/roll are the view's compass heading, climb angle and bank. */
  function setCamera(px, py, pz, yaw, pitch, roll) {
    const cy = Math.cos(yaw), sy = Math.sin(yaw);
    const cp = Math.cos(pitch), sp = Math.sin(pitch);
    // Forward (north = -z at yaw 0), right and up, before the bank is rolled in.
    const f = [sy * cp, sp, -cy * cp];
    const r = [cy, 0, sy];
    const u = [r[1] * f[2] - r[2] * f[1], r[2] * f[0] - r[0] * f[2], r[0] * f[1] - r[1] * f[0]];
    const cr = Math.cos(roll), sr = Math.sin(roll);
    cam = {
      x: px, y: py, z: pz, f,
      r: [r[0] * cr + u[0] * sr, r[1] * cr + u[1] * sr, r[2] * cr + u[2] * sr],
      u: [u[0] * cr - r[0] * sr, u[1] * cr - r[1] * sr, u[2] * cr - r[2] * sr],
      focal: (H / 2) / Math.tan((62 * Math.PI / 180) / 2),
    };
  }

  /** A world point in camera space: [right, up, forward]. */
  function toCam(x, y, z) {
    const dx = x - cam.x, dy = y - cam.y, dz = z - cam.z;
    return [
      dx * cam.r[0] + dy * cam.r[1] + dz * cam.r[2],
      dx * cam.u[0] + dy * cam.u[1] + dz * cam.u[2],
      dx * cam.f[0] + dy * cam.f[1] + dz * cam.f[2],
    ];
  }

  /** A camera-space point on the screen, or null when it is behind the near plane. */
  function project(c) {
    if (c[2] < NEAR) return null;
    return [W / 2 + (c[0] * cam.focal) / c[2], H / 2 - (c[1] * cam.focal) / c[2], c[2]];
  }

  /** Clip a camera-space polygon against the near plane (Sutherland–Hodgman, one plane). */
  function clipNear(poly) {
    const out = [];
    for (let i = 0; i < poly.length; i++) {
      const a = poly[i];
      const b = poly[(i + 1) % poly.length];
      const aIn = a[2] >= NEAR;
      const bIn = b[2] >= NEAR;
      if (aIn) out.push(a);
      if (aIn !== bIn) {
        const t = (NEAR - a[2]) / (b[2] - a[2]);
        out.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, NEAR]);
      }
    }
    return out;
  }

  /** Fill a world-space polygon (array of [x, y, z]) with a CSS colour, if any of it shows. */
  function fillPoly(points, fill) {
    const clipped = clipNear(points.map(([x, y, z]) => toCam(x, y, z)));
    if (clipped.length < 3) return;
    ctx.beginPath();
    clipped.forEach((c, i) => {
      const p = project(c);
      if (i === 0) ctx.moveTo(p[0], p[1]);
      else ctx.lineTo(p[0], p[1]);
    });
    ctx.closePath();
    ctx.fillStyle = fill;
    ctx.fill();
  }

  /** Stroke a world-space segment, clipped at the near plane. */
  function strokeSeg(a, b, style, width) {
    let ca = toCam(a[0], a[1], a[2]);
    let cb = toCam(b[0], b[1], b[2]);
    if (ca[2] < NEAR && cb[2] < NEAR) return;
    if (ca[2] < NEAR || cb[2] < NEAR) {
      const behind = ca[2] < NEAR ? ca : cb;
      const front = ca[2] < NEAR ? cb : ca;
      const t = (NEAR - behind[2]) / (front[2] - behind[2]);
      const cut = [behind[0] + (front[0] - behind[0]) * t, behind[1] + (front[1] - behind[1]) * t, NEAR];
      if (ca[2] < NEAR) ca = cut;
      else cb = cut;
    }
    const pa = project(ca);
    const pb = project(cb);
    ctx.beginPath();
    ctx.moveTo(pa[0], pa[1]);
    ctx.lineTo(pb[0], pb[1]);
    ctx.strokeStyle = style;
    ctx.lineWidth = width;
    ctx.stroke();
  }

  /** A ribbon along a polyline (the river, the roads): a quad per segment, at heightFn + lift. */
  function drawRibbon(points, halfWidth, lift, color, light = 1) {
    for (let i = 0; i < points.length - 1; i++) {
      const [ax, az] = points[i];
      const [bx, bz] = points[i + 1];
      const vx = bx - ax, vz = bz - az;
      const len = Math.hypot(vx, vz) || 1;
      const px = (-vz / len) * halfWidth, pz = (vx / len) * halfWidth;
      const midDist = Math.hypot((ax + bx) / 2 - cam.x, (az + bz) / 2 - cam.z);
      if (midDist > VIEW_DIST) continue;
      const ya = ribbonHeight(ax, az) + lift;
      const yb = ribbonHeight(bx, bz) + lift;
      fillPoly([
        [ax + px, ya, az + pz], [ax - px, ya, az - pz],
        [bx - px, yb, bz - pz], [bx + px, yb, bz + pz],
      ], shade(color, light, hazeOf(midDist)));
    }
  }

  /** Ground height for ribbons and strips, which follow the terrain they lie on. */
  let heightFn = () => 0;
  function ribbonHeight(x, z) {
    return heightFn(x, z);
  }

  /** A house-shaped box with a pitched roof, drawn face by face where it faces the camera. */
  function drawBox(x, z, baseY, w, d, hgt, rot, wall, roof) {
    const c = Math.cos(rot), s = Math.sin(rot);
    const corner = (lx, lz, y) => [x + lx * c - lz * s, y, z + lx * s + lz * c];
    const hw = w / 2, hd = d / 2;
    const roofH = Math.min(w, d) * 0.42;
    const b = [corner(-hw, -hd, baseY), corner(hw, -hd, baseY), corner(hw, hd, baseY), corner(-hw, hd, baseY)];
    const t = [corner(-hw, -hd, baseY + hgt), corner(hw, -hd, baseY + hgt), corner(hw, hd, baseY + hgt), corner(-hw, hd, baseY + hgt)];
    const ridgeA = corner(-hw * 0.82, 0, baseY + hgt + roofH);
    const ridgeB = corner(hw * 0.82, 0, baseY + hgt + roofH);
    const dist = Math.hypot(x - cam.x, z - cam.z);
    const haze = hazeOf(dist);
    const faces = [];
    const addFace = (pts, normal, color) => {
      const cx = (pts[0][0] + pts[2][0]) / 2, cz = (pts[0][2] + pts[2][2]) / 2;
      const facing = normal[0] * (cam.x - cx) + normal[2] * (cam.z - cz);
      if (facing <= 0) return;
      const light = clamp(0.68 + 0.34 * Math.max(0, normal[0] * SUN[0] + normal[2] * SUN[2]), 0.6, 1.05);
      faces.push({ pts, fill: shade(color, light, haze) });
    };
    const nrm = (lx, lz) => [lx * c - lz * s, 0, lx * s + lz * c];
    addFace([b[0], b[1], t[1], t[0]], nrm(0, -1), wall);
    addFace([b[1], b[2], t[2], t[1]], nrm(1, 0), wall);
    addFace([b[2], b[3], t[3], t[2]], nrm(0, 1), wall);
    addFace([b[3], b[0], t[0], t[3]], nrm(-1, 0), wall);
    addFace([t[0], t[1], ridgeB, ridgeA], nrm(0, -0.8), roof);
    addFace([t[2], t[3], ridgeA, ridgeB], nrm(0, 0.8), roof);
    addFace([t[1], t[2], ridgeB], nrm(0.8, 0), roof);
    addFace([t[3], t[0], ridgeA], nrm(-0.8, 0), roof);
    faces.sort((p, q) => distOf(q.pts) - distOf(p.pts));
    for (const face of faces) fillPoly(face.pts, face.fill);
  }

  function distOf(pts) {
    let d = 0;
    for (const p of pts) d = Math.max(d, Math.hypot(p[0] - cam.x, p[2] - cam.z));
    return d;
  }

  /** A mountain cone: segments around a base ring, lit by the sun's side, snow above the line. */
  function drawMountain(m) {
    const SEG = 10;
    const base = [];
    for (let i = 0; i <= SEG; i++) {
      const a = (i / SEG) * Math.PI * 2;
      const x = m.x + Math.cos(a) * m.r;
      const z = m.z + Math.sin(a) * m.r;
      base.push([x, heightFn(x, z) - 3, z]);
    }
    const apex = [m.x, heightFn(m.x, m.z) + m.peak * 0.04, m.z];
    const dist = Math.hypot(m.x - cam.x, m.z - cam.z);
    const haze = hazeOf(dist);
    const sunH = Math.hypot(SUN[0], SUN[2]);
    for (let i = 0; i < SEG; i++) {
      const mid = ((i + 0.5) / SEG) * Math.PI * 2;
      const dot = (Math.cos(mid) * SUN[0] + Math.sin(mid) * SUN[2]) / sunH;
      const light = clamp(0.66 + 0.4 * Math.max(0, dot), 0.6, 1.06);
      fillPoly([base[i], base[i + 1], apex], shade([126, 132, 146], light, haze));
      if (m.peak > 290) {
        const topA = lerp3(base[i], apex, 0.68);
        const topB = lerp3(base[i + 1], apex, 0.68);
        fillPoly([topA, topB, apex], shade([236, 241, 246], light, haze));
      }
    }
  }

  function lerp3(a, b, t) {
    return [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)];
  }

  /** A tree: a short trunk and two stacked cones of foliage, sized by its distance. */
  function drawTree(tree) {
    const p = project(toCam(tree.x, tree.h, tree.z));
    if (!p) return;
    const dist = p[2];
    const hPx = (cam.focal * 12 * tree.s) / dist;
    if (hPx < 2.5) return;
    const [sx, sy] = p;
    const haze = hazeOf(dist);
    ctx.fillStyle = shade([96, 74, 52], 0.9, haze);
    ctx.fillRect(sx - Math.max(1, hPx * 0.035), sy - hPx * 0.3, Math.max(2, hPx * 0.07), hPx * 0.3);
    const foliage = shade([42 + tree.tone, 98, 48], 0.95, haze);
    ctx.fillStyle = foliage;
    for (const [cyF, wF] of [[0.52, 0.34], [0.82, 0.24]]) {
      ctx.beginPath();
      ctx.moveTo(sx - hPx * wF, sy - hPx * cyF + hPx * 0.22);
      ctx.lineTo(sx + hPx * wF, sy - hPx * cyF + hPx * 0.22);
      ctx.lineTo(sx, sy - hPx * (cyF + 0.3));
      ctx.closePath();
      ctx.fill();
    }
  }

  /** A cloud: a loose cluster of soft ellipses, a billboard that drifts with the wind. */
  function drawCloud(cloud, t) {
    const x = cloud.x + t * cloud.speed;
    const wrapped = ((x + 3600) % 7200) - 3600;
    const p = project(toCam(wrapped, cloud.y, cloud.z));
    if (!p) return;
    const dist = p[2];
    if (dist > 7000) return;
    const s = (cam.focal * cloud.s) / dist;
    const [sx, sy] = p;
    const alpha = clamp(0.85 - dist / 9000, 0.3, 0.8);
    ctx.fillStyle = `rgba(252,253,255,${alpha})`;
    for (const [ox, oy, r] of [[-0.42, 0.05, 0.3], [0, -0.02, 0.42], [0.44, 0.06, 0.32], [-0.18, -0.12, 0.3], [0.24, -0.1, 0.28]]) {
      ctx.beginPath();
      ctx.ellipse(sx + ox * s, sy + oy * s, r * s, r * s * 0.42, 0, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.fillStyle = `rgba(214,226,238,${alpha * 0.7})`;
    ctx.beginPath();
    ctx.ellipse(sx, sy + s * 0.1, s * 0.52, s * 0.13, 0, 0, Math.PI * 2);
    ctx.fill();
  }

  /** One ring of the course: a glowing circle standing in the air, lit by its state. */
  function drawRing(ring, state, t) {
    const SEG = 30;
    const u = [-ring.nz, 0, ring.nx];
    const pts = [];
    for (let i = 0; i <= SEG; i++) {
      const a = (i / SEG) * Math.PI * 2;
      const ca = Math.cos(a) * ring.r, sa = Math.sin(a) * ring.r;
      pts.push([ring.x + u[0] * ca, ring.y + sa, ring.z + u[2] * ca]);
    }
    const dist = Math.hypot(ring.x - cam.x, ring.z - cam.z);
    const color = state === 'passed' ? [96, 205, 130] : state === 'next' ? [255, 198, 66] : [110, 215, 250];
    const alpha = state === 'passed' ? 0.45 : state === 'next' ? 0.88 + 0.12 * Math.sin(t * 5) : 0.8;
    if (state === 'next') {
      // A beacon of light down to the ground, so the next ring can be found from anywhere.
      strokeSeg([ring.x, heightFn(ring.x, ring.z), ring.z], [ring.x, ring.y, ring.z], css(color, 0.15), 3);
      // A faint disc fills the circle, to read at a glance which way it faces.
      const disc = pts.slice(0, SEG).map((p) => p);
      fillPoly(disc, css(color, 0.07));
    }
    const width = clamp(10000 / dist, 2, 9);
    for (const [wMul, aMul] of [[2.8, 0.16], [1, 1]]) {
      ctx.beginPath();
      let started = false;
      for (const p of pts) {
        const s = project(toCam(p[0], p[1], p[2]));
        if (!s) { started = false; continue; }
        if (!started) { ctx.moveTo(s[0], s[1]); started = true; }
        else ctx.lineTo(s[0], s[1]);
      }
      ctx.strokeStyle = css(color, alpha * aMul);
      ctx.lineWidth = width * wMul;
      ctx.stroke();
    }
  }

  /** The aeroplane in chase view: a stylised low-poly drawing that banks with the controls. */
  function drawPlaneChase(ac, t) {
    const s = Math.min(W, H) / 590;
    const cx = W / 2;
    const cy = H * 0.565 + Math.sin(t * 1.7) * 2.5;
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(ac.roll * 0.82);
    ctx.translate(0, -ac.pitch * 130);
    ctx.scale(s, s);
    const cream = '#e9e2d2';
    const crimson = '#c23b32';
    const dark = '#2c3440';
    // The propeller's blur: two faint ellipses at the nose, busier with the throttle — a
    // suggestion of a spinning disc, never a solid shape in its own right.
    for (const [rx, ry, a] of [[92, 15, 0.05 + ac.throttle * 0.045], [64, 10, 0.05 + ac.throttle * 0.04]]) {
      ctx.fillStyle = `rgba(40,44,52,${a})`;
      ctx.beginPath();
      ctx.ellipse(0, -88, rx, ry, 0, 0, Math.PI * 2);
      ctx.fill();
    }
    // The main wing, with cream tips.
    ctx.fillStyle = crimson;
    roundRectPath(-110, 2, 220, 30, 12);
    ctx.fill();
    ctx.fillStyle = cream;
    roundRectPath(-110, 2, 26, 30, 10);
    ctx.fill();
    roundRectPath(84, 2, 26, 30, 10);
    ctx.fill();
    // The fuselage, tapering to the nose.
    ctx.fillStyle = cream;
    ctx.beginPath();
    ctx.moveTo(0, -96);
    ctx.quadraticCurveTo(14, -52, 15, -6);
    ctx.quadraticCurveTo(15, 34, 9, 62);
    ctx.quadraticCurveTo(4, 76, 0, 76);
    ctx.quadraticCurveTo(-4, 76, -9, 62);
    ctx.quadraticCurveTo(-15, 34, -15, -6);
    ctx.quadraticCurveTo(-14, -52, 0, -96);
    ctx.fill();
    ctx.fillStyle = 'rgba(90,80,60,0.18)';
    ctx.beginPath();
    ctx.moveTo(0, -96);
    ctx.quadraticCurveTo(14, -52, 15, -6);
    ctx.quadraticCurveTo(15, 34, 9, 62);
    ctx.quadraticCurveTo(4, 76, 0, 76);
    ctx.closePath();
    ctx.fill();
    // The canopy, a dark teardrop over the cabin.
    ctx.fillStyle = dark;
    ctx.beginPath();
    ctx.ellipse(0, -40, 8.5, 21, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = 'rgba(190,220,245,0.55)';
    ctx.beginPath();
    ctx.ellipse(-2.5, -46, 3, 10, 0, 0, Math.PI * 2);
    ctx.fill();
    // Tailplane and fin.
    ctx.fillStyle = crimson;
    roundRectPath(-47, 54, 94, 15, 6);
    ctx.fill();
    ctx.fillRect(-3.5, 26, 7, 34);
    // The spinner.
    ctx.fillStyle = '#3c4046';
    ctx.beginPath();
    ctx.arc(0, -90, 5.5, 0, Math.PI * 2);
    ctx.fill();
    // The gear, when it is down: two struts and wheels under the wing.
    if (ac.gearDown) {
      ctx.strokeStyle = '#3a3f45';
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.moveTo(-24, 26); ctx.lineTo(-30, 46);
      ctx.moveTo(24, 26); ctx.lineTo(30, 46);
      ctx.stroke();
      ctx.fillStyle = '#22252a';
      ctx.beginPath();
      ctx.arc(-31, 49, 6.5, 0, Math.PI * 2);
      ctx.arc(31, 49, 6.5, 0, Math.PI * 2);
      ctx.fill();
    }
    // Navigation lights: red to port, green to starboard, a white strobe at the tail.
    ctx.fillStyle = '#ff463c';
    ctx.beginPath(); ctx.arc(-107, 17, 4, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#3cff78';
    ctx.beginPath(); ctx.arc(107, 17, 4, 0, Math.PI * 2); ctx.fill();
    if ((t % 1.1) < 0.07) {
      ctx.fillStyle = 'rgba(255,255,255,0.95)';
      ctx.beginPath(); ctx.arc(0, 72, 5, 0, Math.PI * 2); ctx.fill();
    }
    ctx.restore();
  }

  function roundRectPath(x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  /**
   * Draw the whole scene: sky, island, course and (in chase view) the aeroplane.
   * `view` is 'chase' or 'cockpit'; `t` is the scene clock in seconds, for pulses and drift.
   */
  function draw(world, ac, view, t) {
    resize();
    if (W === 0) return;
    heightFn = world.heightAt;

    // The camera: trailing the aeroplane in chase view, at its pilot's eye in cockpit view.
    const sinH = Math.sin(ac.heading), cosH = Math.cos(ac.heading);
    if (view === 'cockpit') {
      setCamera(ac.x, ac.y + 1.5, ac.z, ac.heading, ac.pitch, ac.roll * 0.92);
    } else {
      const back = 34, up = 11;
      const fx = sinH * Math.cos(ac.pitch), fz = -cosH * Math.cos(ac.pitch);
      const px = ac.x - fx * back;
      const pz = ac.z - fz * back;
      const py = Math.max(ac.y - Math.sin(ac.pitch) * back + up, world.heightAt(px, pz) + 3);
      setCamera(px, py, pz, ac.heading, ac.pitch * 0.52 - 0.015, ac.roll * 0.55);
    }

    // Sky: a vertical gradient, then the sun and its glow.
    const sky = ctx.createLinearGradient(0, 0, 0, H);
    sky.addColorStop(0, '#2c5ea6');
    sky.addColorStop(0.52, '#6ea8d8');
    sky.addColorStop(0.8, '#bcdcf0');
    sky.addColorStop(1, '#e8f2f6');
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, W, H);
    const sunP = project(toCam(cam.x + SUN[0] * 8000, cam.y + SUN[1] * 8000, cam.z + SUN[2] * 8000));
    if (sunP) {
      const glow = ctx.createRadialGradient(sunP[0], sunP[1], 8, sunP[0], sunP[1], 210);
      glow.addColorStop(0, 'rgba(255,246,218,0.85)');
      glow.addColorStop(0.25, 'rgba(255,240,200,0.35)');
      glow.addColorStop(1, 'rgba(255,240,200,0)');
      ctx.fillStyle = glow;
      ctx.fillRect(sunP[0] - 220, sunP[1] - 220, 440, 440);
      ctx.fillStyle = '#fff6da';
      ctx.beginPath();
      ctx.arc(sunP[0], sunP[1], 24, 0, Math.PI * 2);
      ctx.fill();
    }

    // The far ground: a hazed skirt under everything, beyond the island's own edge.
    fillPoly([[-7000, -2, -7000], [7000, -2, -7000], [7000, -2, 7000], [-7000, -2, 7000]], shade([100, 134, 92], 1, 0.5));

    // The field patchwork, far to near, each cell at its own heights.
    const cells = [];
    for (const cell of world.cells) {
      const cxm = cell.x + cell.size / 2, czm = cell.z + cell.size / 2;
      const dist = Math.hypot(cxm - cam.x, czm - cam.z);
      if (dist < VIEW_DIST) cells.push([dist, cell]);
    }
    cells.sort((a, b) => b[0] - a[0]);
    for (const [dist, cell] of cells) {
      const { x, z, size } = cell;
      const h00 = world.heightAt(x, z), h10 = world.heightAt(x + size, z);
      const h11 = world.heightAt(x + size, z + size), h01 = world.heightAt(x, z + size);
      const light = clamp(0.92 + (h00 - h11) * 0.005 + cell.shade * 0.004, 0.76, 1.07);
      fillPoly([[x, h00, z], [x + size, h10, z], [x + size, h11, z + size], [x, h01, z + size]], shade(cell.color, light, hazeOf(dist)));
      if (cell.rows && dist < 1350) {
        ctx.strokeStyle = 'rgba(40,50,20,0.13)';
        ctx.lineWidth = 2;
        for (const f of [0.25, 0.5, 0.75]) {
          const zz = z + size * f;
          const hh = world.heightAt(x, zz) + 0.15;
          const hh2 = world.heightAt(x + size, zz) + 0.15;
          strokeSeg([x + 6, hh, zz], [x + size - 6, hh2, zz], 'rgba(40,50,20,0.13)', 2);
        }
      }
    }

    // The sea, painted over the patchwork wherever the coast says the land ends.
    const waterPts = [];
    for (let z = -7000; z <= 7000; z += 350) waterPts.push([coastX(clamp(z, -3000, 3000)) + 4, 0.12, z]);
    waterPts.push([7000, 0.12, 7000], [7000, 0.12, -7000]);
    fillPoly(waterPts, shade([37, 92, 142], 1, 0.22));

    // The shore's sand, the river and the roads, lying on the ground they follow.
    const sandOuter = [], sandInner = [];
    for (let z = -3000; z <= 3000; z += 150) {
      const cxz = coastX(z);
      sandOuter.push([cxz + 8, world.heightAt(cxz + 8, z) + 0.3, z]);
      sandInner.push([cxz - 40, world.heightAt(cxz - 40, z) + 0.3, z]);
    }
    for (let i = 0; i < sandOuter.length - 1; i++) {
      fillPoly([sandOuter[i], sandOuter[i + 1], sandInner[i + 1], sandInner[i]], shade([224, 205, 152], 1, hazeOf(Math.hypot(sandInner[i][0] - cam.x, sandInner[i][2] - cam.z))));
    }
    drawRibbon(world.river.points, world.river.halfWidth, 0.4, [52, 110, 160]);
    drawRibbon(world.river.points, world.river.halfWidth * 0.45, 0.5, [92, 150, 196]);
    for (const road of world.roads) drawRibbon(road.points, road.width / 2, 0.35, [106, 108, 110]);

    drawRunway(world);

    // Everything that stands up, far to near: mountains, houses, trees.
    const items = [];
    for (const m of world.mountains) items.push({ d: Math.hypot(m.x - cam.x, m.z - cam.z), kind: 'mountain', m });
    for (const house of world.houses) {
      const d = Math.hypot(house.x - cam.x, house.z - cam.z);
      if (d < 2400) items.push({ d, kind: 'house', m: house });
    }
    for (const tree of world.trees) {
      const d = Math.hypot(tree.x - cam.x, tree.z - cam.z);
      if (d < 1700) items.push({ d, kind: 'tree', m: tree });
    }
    items.sort((a, b) => b.d - a.d);
    for (const item of items) {
      if (item.kind === 'mountain') drawMountain(item.m);
      else if (item.kind === 'house') drawBox(item.m.x, item.m.z, item.m.h, item.m.w, item.m.d, item.m.hgt, item.m.rot, item.m.wall, item.m.roof);
      else drawTree(item.m);
    }

    // The aeroplane's shadow on the ground below: the landing judge's best friend.
    const agl = ac.y - world.heightAt(ac.x, ac.z);
    if (ac.phase === 'air' && agl < 320) {
      const sp = project(toCam(ac.x, world.heightAt(ac.x, ac.z) + 0.4, ac.z));
      if (sp) {
        const r = clamp((cam.focal * 8) / sp[2], 3, 90) * clamp(1.15 - agl / 420, 0.45, 1.1);
        ctx.fillStyle = `rgba(18,26,18,${clamp(0.4 - agl * 0.0011, 0.07, 0.4)})`;
        ctx.beginPath();
        ctx.ellipse(sp[0], sp[1], r, r * 0.36, 0, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    // The rings, far to near, then the clouds, then the aeroplane itself.
    const ringItems = world.rings.map((ring) => ({
      ring,
      d: Math.hypot(ring.x - cam.x, ring.z - cam.z),
      state: ring.index < ac.ringsPassed ? 'passed' : ring.index === ac.ringsPassed ? 'next' : 'todo',
    }));
    ringItems.sort((a, b) => b.d - a.d);
    for (const { ring, state } of ringItems) drawRing(ring, state, t);

    const cloudItems = world.clouds.map((cloud) => ({ cloud, d: Math.hypot(cloud.x - cam.x, cloud.z - cam.z) }));
    cloudItems.sort((a, b) => b.d - a.d);
    for (const { cloud } of cloudItems) drawCloud(cloud, t);

    if (view === 'chase') drawPlaneChase(ac, t);
  }

  /** The airfield in full: strip, markings, edge lights, apron and hangars. */
  function drawRunway(world) {
    const R = RUNWAY;
    const y = 0.14;
    fillPoly([[R.cx - R.width / 2, y, R.zNorth], [R.cx + R.width / 2, y, R.zNorth], [R.cx + R.width / 2, y, R.zSouth], [R.cx - R.width / 2, y, R.zSouth]], shade([52, 55, 60], 1, hazeOf(Math.hypot(R.cx - cam.x, cam.z))));
    // Threshold bars and the dashed centreline.
    const white = shade([228, 228, 222], 1, 0.15);
    for (const endZ of [R.zNorth, R.zSouth]) {
      const dir = endZ === R.zNorth ? 1 : -1;
      for (let i = 0; i < 4; i++) {
        const bx = R.cx - 18 + i * 9.5;
        fillPoly([[bx, y + 0.03, endZ + dir * 6], [bx + 4.6, y + 0.03, endZ + dir * 6], [bx + 4.6, y + 0.03, endZ + dir * 34], [bx, y + 0.03, endZ + dir * 34]], white);
      }
    }
    for (let z = R.zNorth + 52; z < R.zSouth - 40; z += 78) {
      fillPoly([[R.cx - 0.9, y + 0.03, z], [R.cx + 0.9, y + 0.03, z], [R.cx + 0.9, y + 0.03, z + 36], [R.cx - 0.9, y + 0.03, z + 36]], white);
    }
    // Edge lights: small warm dots down both sides.
    for (let z = R.zNorth; z <= R.zSouth; z += 120) {
      for (const ex of [R.cx - R.width / 2 - 3, R.cx + R.width / 2 + 3]) {
        const p = project(toCam(ex, 0.7, z));
        if (p) {
          ctx.fillStyle = 'rgba(255,238,180,0.9)';
          const r = clamp(320 / p[2], 1, 3.6);
          ctx.fillRect(p[0] - r / 2, p[1] - r / 2, r, r);
        }
      }
    }
    // Apron and two hangars at the south end.
    fillPoly([[-1796, y, 492], [-1652, y, 492], [-1652, y, 652], [-1796, y, 652]], shade([118, 120, 122], 1, 0.1));
    drawBox(-1735, 585, 0, 52, 34, 13, 0.2, [150, 152, 156], [88, 92, 100]);
    drawBox(-1546, 640, 0, 44, 30, 11, -0.15, [158, 156, 148], [96, 84, 74]);
    void world;
  }

  return {
    draw,
    get ctx() { return ctx; },
    get width() { return W; },
    get height() { return H; },
  };
}
