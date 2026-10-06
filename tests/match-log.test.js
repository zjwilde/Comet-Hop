// The match log: what gets recorded, and the summary used to check how shots get spent.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createGame, stepGame } from '../src/game.js';
import { HumanController, IdleController } from '../src/controllers.js';
import { giveWeapon } from '../src/weapons.js';
import { summarizeMatchLog } from '../src/match-log.js';
import { add } from '../src/vector.js';
import { copyOfSettings, createSeededRandom, noControls } from './helpers.js';

const stepSeconds = 1 / 120;

test('the log records limited-ammo shots, where they land, hits, and unused ammo lost with a life', async () => {
  const settings = await copyOfSettings();
  settings.drone.includeInMatch = false;
  const game = createGame(settings, createSeededRandom(1));
  game.bot.controller = new IdleController();
  // The bot floats just above the player, in the line of fire, and is carrying unused mortar shells.
  game.bot.movementMode = 'airborne';
  game.bot.groundedCometIndex = null;
  game.bot.position = add(game.player.position, { x: 0, y: -1.5 });
  giveWeapon(game.bot.arsenal, 'mortar', settings.weapons);
  game.bot.vitals.livesRemaining = 1;
  game.bot.vitals.health = 10;
  giveWeapon(game.player.arsenal, 'heavyCannon', settings.weapons);
  game.player.controller = new HumanController(() => ({ ...noControls, firePressed: true, aimPoint: { ...game.bot.position } }));
  stepGame(game, stepSeconds);
  game.player.controller = new IdleController();
  for (let step = 0; step < 60; step += 1) stepGame(game, stepSeconds);

  const summary = summarizeMatchLog(game.matchLog);
  assert.deepEqual(summary.player.limitedShotsFired, { heavyCannon: 1 });
  assert.equal(summary.player.limitedLandings, 1);
  assert.equal(summary.player.limitedLandingsUseful, 1, 'it hit the bot');
  assert.equal(summary.player.damageDealt, 10, 'the damage actually taken: the bot only had 10 health');
  assert.deepEqual(summary.bot.livesLost.map((life) => life.unusedLimitedShots), [settings.weapons.mortar.ammoPerPickup]);
});
