// Keyboard and mouse, read as the game wants them: two control axes (pitch and roll), a throttle
// rate, and a set of one-shot actions (confirm, pause, view, mute, restart, gear). Keys are held
// in a set by code; actions accumulate on key presses and clicks until the main loop takes them.
// The mouse steers too: wherever the pointer rests away from the screen's centre is where the
// nose is asked to go, until a key is touched, which takes the controls back.

/** One-shot actions, as bits, drained by takeActions(). */
export const ACTION_CONFIRM = 1;
export const ACTION_PAUSE = 2;
export const ACTION_VIEW = 4;
export const ACTION_MUTE = 8;
export const ACTION_RESTART = 16;
export const ACTION_GEAR = 32;

/** Codes whose default behaviour (scrolling, quick-find) the game must never trigger. */
const SWALLOWED = new Set([
  'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space',
  'PageUp', 'PageDown', 'KeyW', 'KeyA', 'KeyS', 'KeyD',
]);

export function createInput(canvas) {
  const held = new Set();
  let pending = 0;
  let mouseX = 0.5;
  let mouseY = 0.5;
  let mouseFreshUntil = 0;
  /** Called on the first key or click: the gesture that lets sound begin. */
  let gestureHook = null;

  function gesture() {
    if (gestureHook) {
      const hook = gestureHook;
      gestureHook = null;
      hook();
    }
  }

  window.addEventListener('keydown', (event) => {
    gesture();
    if (SWALLOWED.has(event.code)) event.preventDefault();
    if (event.repeat) return;
    held.add(event.code);
    if (event.code === 'Enter' || event.code === 'Space') pending |= ACTION_CONFIRM;
    else if (event.code === 'KeyP' || event.code === 'Escape') pending |= ACTION_PAUSE;
    else if (event.code === 'KeyV') pending |= ACTION_VIEW;
    else if (event.code === 'KeyM') pending |= ACTION_MUTE;
    else if (event.code === 'KeyR') pending |= ACTION_RESTART;
    else if (event.code === 'KeyG') pending |= ACTION_GEAR;
  });
  window.addEventListener('keyup', (event) => held.delete(event.code));
  window.addEventListener('blur', () => held.clear());
  canvas.addEventListener('pointermove', (event) => {
    const rect = canvas.getBoundingClientRect();
    mouseX = (event.clientX - rect.left) / Math.max(rect.width, 1);
    mouseY = (event.clientY - rect.top) / Math.max(rect.height, 1);
    mouseFreshUntil = performance.now() + 4000;
  });
  canvas.addEventListener('pointerdown', () => {
    gesture();
    pending |= ACTION_CONFIRM;
  });

  const anyKey = (...codes) => codes.some((code) => held.has(code));

  return {
    /** Register the one-time first-gesture callback (audio start). */
    onFirstGesture(hook) {
      gestureHook = hook;
    },
    /** The one-shot actions since the last call; calling clears them. */
    takeActions() {
      const actions = pending;
      pending = 0;
      return actions;
    },
    /**
     * The controls right now: pitch and roll in [-1, 1] (pitch positive = nose up, roll
     * positive = bank right) and the throttle lever's rate in [-1, 1] per second.
     */
    axes() {
      let pitch = 0;
      let roll = 0;
      if (anyKey('ArrowUp', 'KeyW')) pitch += 1;
      if (anyKey('ArrowDown', 'KeyS')) pitch -= 1;
      if (anyKey('ArrowRight', 'KeyD')) roll += 1;
      if (anyKey('ArrowLeft', 'KeyA')) roll -= 1;
      if (pitch === 0 && roll === 0 && performance.now() < mouseFreshUntil) {
        pitch = clampAxis((0.5 - mouseY) * 1.7);
        roll = clampAxis((mouseX - 0.5) * 1.9);
      }
      let throttleDelta = 0;
      if (anyKey('ShiftLeft', 'ShiftRight', 'PageUp')) throttleDelta += 1;
      if (anyKey('ControlLeft', 'ControlRight', 'PageDown')) throttleDelta -= 1;
      return { pitch, roll, throttleDelta };
    },
  };
}

function clampAxis(value) {
  return value < -1 ? -1 : value > 1 ? 1 : value;
}
