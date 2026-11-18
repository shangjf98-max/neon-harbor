// Keyboard and mouse input, read once per frame. Movement is a held direction;
// the one-shot actions (confirm, pause, interact, punch, mute, missions) are
// edge-triggered and consumed by takeActions(), so a held key never double-fires.

export const ACTION_CONFIRM = 1;
export const ACTION_PAUSE = 2;
export const ACTION_INTERACT = 4;
export const ACTION_PUNCH = 8;
export const ACTION_MUTE = 16;
export const ACTION_MISSIONS = 32;

const KEYMAP = {
  Enter: ACTION_CONFIRM,
  Space: ACTION_PUNCH,
  KeyE: ACTION_INTERACT,
  Escape: ACTION_PAUSE,
  KeyP: ACTION_PAUSE,
  KeyM: ACTION_MUTE,
  Tab: ACTION_MISSIONS,
};

export function createInput(canvas) {
  const held = new Set();
  let queued = 0;
  let click = null;
  let mouse = { x: 0, y: 0 };

  function onKeyDown(event) {
    if (event.code === 'Tab') event.preventDefault();
    if (event.repeat) return;
    held.add(event.code);
    const action = KEYMAP[event.code];
    if (action !== undefined) queued |= action;
  }

  function onKeyUp(event) {
    held.delete(event.code);
  }

  function onMouseDown(event) {
    const rect = canvas.getBoundingClientRect();
    click = { x: event.clientX - rect.left, y: event.clientY - rect.top, button: event.button };
    if (event.button === 0) queued |= ACTION_PUNCH;
  }

  function onMouseMove(event) {
    const rect = canvas.getBoundingClientRect();
    mouse = { x: event.clientX - rect.left, y: event.clientY - rect.top };
  }

  window.addEventListener('keydown', onKeyDown);
  window.addEventListener('keyup', onKeyUp);
  canvas.addEventListener('mousedown', onMouseDown);
  canvas.addEventListener('mousemove', onMouseMove);
  canvas.addEventListener('contextmenu', (event) => event.preventDefault());
  window.addEventListener('blur', () => held.clear());

  /** Held movement as {x, y} in [-1, 1], normalised. */
  function moveVector() {
    let x = 0;
    let y = 0;
    if (held.has('KeyA') || held.has('ArrowLeft')) x -= 1;
    if (held.has('KeyD') || held.has('ArrowRight')) x += 1;
    if (held.has('KeyW') || held.has('ArrowUp')) y -= 1;
    if (held.has('KeyS') || held.has('ArrowDown')) y += 1;
    if (x !== 0 && y !== 0) {
      x *= Math.SQRT1_2;
      y *= Math.SQRT1_2;
    }
    return { x, y };
  }

  /** Driving input: throttle [-1, 1] (W/S), steer [-1, 1] (A/D), handbrake. */
  function driveVector() {
    let throttle = 0;
    if (held.has('KeyW') || held.has('ArrowUp')) throttle += 1;
    if (held.has('KeyS') || held.has('ArrowDown')) throttle -= 1;
    let steer = 0;
    if (held.has('KeyA') || held.has('ArrowLeft')) steer -= 1;
    if (held.has('KeyD') || held.has('ArrowRight')) steer += 1;
    return { throttle, steer, handbrake: held.has('Space') };
  }

  function sprinting() {
    return held.has('ShiftLeft') || held.has('ShiftRight');
  }

  /** The one-shot actions queued since the last call, then cleared. */
  function takeActions() {
    const actions = queued;
    queued = 0;
    return actions;
  }

  /** The last mouse click in canvas pixels since the last call, then cleared. */
  function takeClick() {
    const at = click;
    click = null;
    return at;
  }

  return { moveVector, driveVector, sprinting, takeActions, takeClick, mouse: () => mouse, held: () => held };
}
