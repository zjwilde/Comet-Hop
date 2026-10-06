// Keyboard and mouse. One-off presses (jump, switch weapon, restart, and a click to fire) are remembered until the game
// takes them, so a quick tap is never missed between physics steps.
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
  let fireClicked = false;
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
  canvas.addEventListener('mousemove', (event) => {
    const canvasBox = canvas.getBoundingClientRect();
    mouseOnScreen.x = event.clientX - canvasBox.left;
    mouseOnScreen.y = event.clientY - canvasBox.top;
  });
  canvas.addEventListener('mousedown', (event) => {
    if (event.button !== 0) return;
    fireHeld = true;
    fireClicked = true;
  });
  window.addEventListener('mouseup', (event) => {
    if (event.button === 0) fireHeld = false;
  });

  return {
    // The controls for one physics step. One-off presses are handed over once and then cleared.
    takeControls(view) {
      const controls = {
        runDirection: (heldKeys.has(keyBindings.runClockwise) ? 1 : 0) - (heldKeys.has(keyBindings.runCounterclockwise) ? 1 : 0),
        jumpRequested,
        fireHeld: fireHeld || fireClicked,
        aimPoint: screenToWorld(view, mouseOnScreen),
        switchWeaponRequested,
      };
      jumpRequested = false;
      switchWeaponRequested = false;
      fireClicked = false;
      return controls;
    },
    takeRestartRequest() {
      const wasRequested = restartRequested;
      restartRequested = false;
      return wasRequested;
    },
  };
}
