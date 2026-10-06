// Browser entry point: sizes the canvas, runs physics at a fixed rate, and draws every frame.
import { settings } from './settings.js';
import { createGame, stepGame } from './game.js';
import { HumanController } from './controllers.js';
import { createInput } from './input.js';
import { createView, drawGame, screenToWorld } from './render.js';
import { summarizeMatchLog } from './match-log.js';
import { applyBotDifficulty, difficultyName, defaultDifficulty } from './bot-difficulty.js';

const canvas = document.getElementById('game');

// The bot difficulty slider. It changes the shared settings, so it takes effect at once, even mid-match. The choice is
// remembered in this browser between visits (if the browser allows it).
const difficultyStorageKey = 'comet-hop-bot-difficulty';
const difficultySlider = document.getElementById('bot-difficulty');
const difficultyLabel = document.getElementById('bot-difficulty-name');
function setBotDifficulty(difficulty) {
  applyBotDifficulty(settings.bot, difficulty);
  difficultyLabel.textContent = difficultyName(difficulty);
  try {
    localStorage.setItem(difficultyStorageKey, String(difficulty));
  } catch (error) {
    // Not remembered; it still works for this visit.
  }
}
let startingDifficulty = defaultDifficulty;
try {
  const remembered = localStorage.getItem(difficultyStorageKey);
  if (remembered !== null && Number.isFinite(Number(remembered))) startingDifficulty = Number(remembered);
} catch (error) {
  // Nothing remembered.
}
difficultySlider.value = String(Math.round(startingDifficulty * 100));
setBotDifficulty(startingDifficulty);
difficultySlider.addEventListener('input', () => setBotDifficulty(Number(difficultySlider.value) / 100));
// Hands the keyboard straight back to the game after using the slider.
difficultySlider.addEventListener('change', () => difficultySlider.blur());
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

// Saves the match log into the project's playtest-logs folder (through the local server) every few seconds, when the
// match ends, and when a new one starts, so a playtest can be looked at afterwards. Nothing leaves this computer.
const secondsBetweenLogSaves = 10;
function newMatchId() {
  return `match-${new Date().toISOString().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/-+$/, '')}`;
}
let matchId = newMatchId();
function saveMatchLog() {
  if (game.matchLog.length === 0) return;
  const body = JSON.stringify({ matchId, botDifficulty: settings.bot.difficulty, outcome: game.outcome, summary: summarizeMatchLog(game.matchLog), log: game.matchLog });
  fetch(`/match-log/${matchId}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body }).catch(() => {});
}
setInterval(saveMatchLog, secondsBetweenLogSaves * 1000);
let savedFinishedMatch = false;
let previousFrameTime = null;
let unsimulatedSeconds = 0;
function onFrame(frameTime) {
  if (previousFrameTime !== null) unsimulatedSeconds += Math.min(longestCatchUpSeconds, (frameTime - previousFrameTime) / 1000);
  previousFrameTime = frameTime;
  if (input.takeRestartRequest()) {
    saveMatchLog();
    finishedMatchLogs.push(game.matchLog);
    game = createGame(settings, Math.random, keyboardAndMouse);
    matchId = newMatchId();
    savedFinishedMatch = false;
  }
  if (game.outcome && !savedFinishedMatch) {
    saveMatchLog();
    savedFinishedMatch = true;
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
