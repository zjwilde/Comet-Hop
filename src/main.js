// Browser entry point: sizes the canvas, runs physics at a fixed rate, and draws every frame.
import { settings } from './settings.js';
import { createGame, stepGame } from './game.js';
import { HumanController } from './controllers.js';
import { createInput } from './input.js';
import { createView, drawGame, screenToWorld } from './render.js';
import { summarizeMatchLog } from './match-log.js';

const canvas = document.getElementById('game');
const context = canvas.getContext('2d');
const input = createInput(canvas);
const stepSeconds = 1 / settings.physics.stepsPerSecond;
// After a long pause (for example a background tab), catch up at most this much time rather than running hundreds of steps.
const longestCatchUpSeconds = 0.25;

let view = null;
// The player's fighter is driven by the keyboard and mouse.
const keyboardAndMouse = new HumanController(() => input.takeControls(view));
let game = createGame(settings, Math.random, keyboardAndMouse);

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

// Logs of matches ended with R, kept so they can still be looked at.
const finishedMatchLogs = [];
let previousFrameTime = null;
let unsimulatedSeconds = 0;
function onFrame(frameTime) {
  if (previousFrameTime !== null) unsimulatedSeconds += Math.min(longestCatchUpSeconds, (frameTime - previousFrameTime) / 1000);
  previousFrameTime = frameTime;
  if (input.takeRestartRequest()) {
    finishedMatchLogs.push(game.matchLog);
    game = createGame(settings, Math.random, keyboardAndMouse);
  }
  while (unsimulatedSeconds >= stepSeconds) {
    stepGame(game, stepSeconds);
    unsimulatedSeconds -= stepSeconds;
  }
  drawGame(context, game, view);
  requestAnimationFrame(onFrame);
}
requestAnimationFrame(onFrame);

// For poking at the game from the browser console while tuning.
window.cometHop = {
  get game() { return game; },
  settings,
  screenToWorld: (point) => screenToWorld(view, point),
  // Summaries of the current match and of earlier ones (ended with R), for checking how shots get spent.
  summary: () => summarizeMatchLog(game.matchLog),
  earlierMatchSummaries: () => finishedMatchLogs.map(summarizeMatchLog),
  finishedMatchLogs,
};
