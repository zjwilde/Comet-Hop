// Browser entry point: sizes the canvas, runs physics at a fixed rate, and draws every frame.
import { settings } from './settings.js';
import { createGame, stepGame } from './game.js';
import { createInput } from './input.js';
import { createView, drawGame, screenToWorld } from './render.js';

const canvas = document.getElementById('game');
const context = canvas.getContext('2d');
const input = createInput(canvas);
const stepSeconds = 1 / settings.physics.stepsPerSecond;
// After a long pause (for example a background tab), catch up at most this much time rather than running hundreds of steps.
const longestCatchUpSeconds = 0.25;

let game = createGame(settings);
let view = null;

function fitCanvasToWindow() {
  const pixelRatio = window.devicePixelRatio || 1;
  canvas.width = Math.round(window.innerWidth * pixelRatio);
  canvas.height = Math.round(window.innerHeight * pixelRatio);
  canvas.style.width = `${window.innerWidth}px`;
  canvas.style.height = `${window.innerHeight}px`;
  context.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
  view = createView(window.innerWidth, window.innerHeight, settings.world);
}
window.addEventListener('resize', fitCanvasToWindow);
fitCanvasToWindow();

let previousFrameTime = null;
let unsimulatedSeconds = 0;
function onFrame(frameTime) {
  if (previousFrameTime !== null) unsimulatedSeconds += Math.min(longestCatchUpSeconds, (frameTime - previousFrameTime) / 1000);
  previousFrameTime = frameTime;
  if (input.takeRestartRequest()) game = createGame(settings);
  while (unsimulatedSeconds >= stepSeconds) {
    stepGame(game, { player: input.takeControls(view) }, stepSeconds);
    unsimulatedSeconds -= stepSeconds;
  }
  drawGame(context, game, view);
  requestAnimationFrame(onFrame);
}
requestAnimationFrame(onFrame);

// For poking at the game from the browser console while tuning.
window.cometHop = { get game() { return game; }, settings, screenToWorld: (point) => screenToWorld(view, point) };
