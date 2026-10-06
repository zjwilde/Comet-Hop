// Keyboard and mouse (or touchpad). One-off presses (jump, switch weapon, restart, and a press to fire) are remembered
// until the game takes them, so a quick tap is never missed between physics steps. Pointer events are used so mice,
// touchpads and pens all behave the same.
import { screenToWorld } from './render.js';

// Which physical key does what (KeyboardEvent.code values, so they stay in the same place on any keyboard layout).
const keyBindings = {
  runCounterclockwise: 'KeyA',
  runClockwise: 'KeyD',
  jump: 'KeyW',
  switchWeapon: 'Tab',
  restart: 'KeyR',
};
const keysThisGameUses = new Set(Object.values(keyBindings));

export function createInput(canvas) {
  const heldKeys = new Set();
  const mouseOnScreen = { x: 0, y: 0 };
  let fireHeld = false;
  let firePressed = false;
  let jumpRequested = false;
  let switchWeaponRequested = false;
  let restartRequested = false;

  window.addEventListener('keydown', (event) => {
    if (!keysThisGameUses.has(event.code)) return;
    event.preventDefault();
    heldKeys.add(event.code);
    if (event.repeat) return;
    if (event.code === keyBindings.jump) jumpRequested = true;
    if (event.code === keyBindings.switchWeapon) switchWeaponRequested = true;
    if (event.code === keyBindings.restart) restartRequested = true;
  });
  window.addEventListener('keyup', (event) => heldKeys.delete(event.code));
  window.addEventListener('blur', () => {
    heldKeys.clear();
    fireHeld = false;
  });
  canvas.addEventListener('pointermove', (event) => {
    const canvasBox = canvas.getBoundingClientRect();
    mouseOnScreen.x = event.clientX - canvasBox.left;
    mouseOnScreen.y = event.clientY - canvasBox.top;
  });
  canvas.addEventListener('pointerdown', (event) => {
    // Stops the browser selecting or dragging anything, which could otherwise steal the following movement.
    event.preventDefault();
    if (event.button !== 0) return;
    fireHeld = true;
    firePressed = true;
    // Keeps aim and release tracked even if the pointer drifts off the canvas while held.
    canvas.setPointerCapture(event.pointerId);
  });
  canvas.addEventListener('pointerup', (event) => {
    if (event.button === 0) fireHeld = false;
  });
  canvas.addEventListener('pointercancel', () => {
    fireHeld = false;
  });
  // A right-click (on a touchpad, often a two-finger tap) would open the browser's menu, which swallows the next tap
  // and stops the aim following the pointer while it's open.
  canvas.addEventListener('contextmenu', (event) => event.preventDefault());

  return {
    // The controls for one physics step. One-off presses are handed over once and then cleared.
    takeControls(view) {
      const controls = {
        runDirection: (heldKeys.has(keyBindings.runClockwise) ? 1 : 0) - (heldKeys.has(keyBindings.runCounterclockwise) ? 1 : 0),
        jumpRequested,
        fireHeld,
        firePressed,
        aimPoint: screenToWorld(view, mouseOnScreen),
        switchWeaponRequested,
      };
      jumpRequested = false;
      switchWeaponRequested = false;
      firePressed = false;
      return controls;
    },
    takeRestartRequest() {
      const wasRequested = restartRequested;
      restartRequested = false;
      return wasRequested;
    },
  };
}
