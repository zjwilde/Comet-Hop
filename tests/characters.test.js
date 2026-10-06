// The class structure: what's shared through inheritance, and fighters being driven by swappable controllers.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createGame, stepGame } from '../src/game.js';
import { Character } from '../src/character.js';
import { Fighter } from '../src/fighter.js';
import { Drone } from '../src/drone.js';
import { HazardDrone } from '../src/hazard-drone.js';
import { HumanController, IdleController } from '../src/controllers.js';
import { BotController } from '../src/bot.js';
import { copyOfSettings, createSeededRandom, noControls } from './helpers.js';

const stepSeconds = 1 / 120;

async function newGame() {
  return createGame(await copyOfSettings(), createSeededRandom(1));
}

test('the player and the bot are both Fighters, differing only in their controller', async () => {
  const game = await newGame();
  assert.ok(game.player instanceof Fighter);
  assert.ok(game.bot instanceof Fighter);
  assert.ok(game.player.controller instanceof IdleController);
  assert.ok(game.bot.controller instanceof BotController);
});

test('the drone is a HazardDrone, which is a Drone, which is a Character, like fighters', async () => {
  const game = await newGame();
  assert.ok(game.drone instanceof HazardDrone);
  assert.ok(game.drone instanceof Drone);
  assert.ok(game.drone instanceof Character);
  assert.ok(game.player instanceof Character);
});

test('any fighter can be driven by any controller: the bot obeys a human controller, the player can be a bot', async () => {
  const game = await newGame();
  game.bot.controller = new HumanController(() => ({ ...noControls, runDirection: 1 }));
  game.player.controller = new BotController();
  const botAngleBefore = game.bot.angleOnComet;
  const playerStartComet = game.player.groundedCometIndex;
  let playerEverMoved = false;
  for (let step = 0; step < 20 / stepSeconds; step += 1) {
    const playerPositionBefore = { ...game.player.position };
    stepGame(game, stepSeconds);
    if (game.player.position.x !== playerPositionBefore.x || game.player.groundedCometIndex !== playerStartComet) playerEverMoved = true;
    if (step === 10) assert.notEqual(game.bot.angleOnComet, botAngleBefore, 'bot followed the human controls');
  }
  assert.ok(playerEverMoved, 'the player, driven by a bot controller, played by itself');
});

test('a new kind of character that forgets a required behaviour fails loudly, naming what is missing', () => {
  class UnfinishedTurret extends Character {}
  const turret = new UnfinishedTurret('turret', 0.5, { maxHealth: 10, startingLives: 1, respawnDelaySeconds: 1, respawnProtectionSeconds: 0 });
  assert.throws(() => turret.update({}, stepSeconds), /UnfinishedTurret must define update/);
  assert.throws(() => turret.receiveKnockback({ x: 1, y: 0 }), /UnfinishedTurret must define receiveKnockback/);
  assert.throws(() => turret.respawn({}), /UnfinishedTurret must define respawn/);
});
