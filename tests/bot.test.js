// The bot: it plays through the same controls as a human, aims well enough to hit, and doesn't throw itself away.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createGame, stepGame } from '../src/game.js';
import { copyOfSettings, createSeededRandom } from './helpers.js';

const stepSeconds = 1 / 120;

async function botMatch(seed, adjustSettings = () => {}) {
  const settings = await copyOfSettings();
  settings.drone.includeInMatch = false;
  adjustSettings(settings);
  return createGame(settings, createSeededRandom(seed));
}

test('the bot hits a player who stands still, within half a minute', async () => {
  for (const seed of [1, 2, 3]) {
    const game = await botMatch(seed);
    for (let step = 0; step < 30 / stepSeconds && game.player.vitals.health === game.settings.rules.maxHealth; step += 1) {
      // The player has an idle controller: it stands still, so only the bot's aiming is being tested.
      stepGame(game, stepSeconds);
    }
    assert.ok(game.player.vitals.health < game.settings.rules.maxHealth, `seed ${seed}: bot never hit`);
  }
});

test('the bot moves around: it runs and jumps to other comets', async () => {
  const game = await botMatch(4, (settings) => { settings.bot.fireWhenShotPassesWithinMetres = -1; });
  const cometsVisited = new Set([game.bot.groundedCometIndex]);
  for (let step = 0; step < 60 / stepSeconds; step += 1) {
    stepGame(game, stepSeconds);
    if (game.bot.movementMode === 'grounded') cometsVisited.add(game.bot.groundedCometIndex);
  }
  assert.ok(cometsVisited.size >= 3, `visited only ${cometsVisited.size} comets`);
});

test('the bot never jumps off the map by itself', async () => {
  for (const seed of [5, 6, 7]) {
    const game = await botMatch(seed, (settings) => { settings.bot.fireWhenShotPassesWithinMetres = -1; });
    for (let step = 0; step < 120 / stepSeconds; step += 1) stepGame(game, stepSeconds);
    assert.equal(game.bot.vitals.livesRemaining, game.settings.rules.startingLives, `seed ${seed}`);
  }
});

test('the bot heads for a crate on its own comet and collects it', async () => {
  const game = await botMatch(8, (settings) => {
    settings.bot.chanceToJumpPerDecision = 0;
    settings.bot.fireWhenShotPassesWithinMetres = -1;
  });
  const comet = game.comets[game.bot.groundedCometIndex];
  const crateAngle = game.bot.angleOnComet + 2;
  game.crateSpawner.crates.push({
    floating: false,
    cometIndex: game.bot.groundedCometIndex,
    angleOnComet: crateAngle,
    position: { x: comet.centre.x + Math.cos(crateAngle) * (comet.radius + 0.35), y: comet.centre.y + Math.sin(crateAngle) * (comet.radius + 0.35) },
    weaponNames: ['drill'],
    secondsRemaining: null,
  });
  for (let step = 0; step < 10 / stepSeconds && game.bot.arsenal.carriedWeapons.length === 1; step += 1) {
    stepGame(game, stepSeconds);
  }
  assert.equal(game.bot.arsenal.carriedWeapons.at(-1).weaponName, 'drill');
});
