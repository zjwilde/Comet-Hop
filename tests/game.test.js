// Whole-game behaviour: shooting, hits, crates, lives, and how a game ends.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createGame, stepGame } from '../src/game.js';
import { createProjectile, updateProjectiles } from '../src/projectiles.js';
import { add, scale } from '../src/vector.js';
import { selectedWeapon } from '../src/weapons.js';
import { copyOfSettings, createSeededRandom, noControls } from './helpers.js';

const stepSeconds = 1 / 120;

async function newGame(seed = 1) {
  return createGame(await copyOfSettings(), createSeededRandom(seed));
}

// Parks the drone in open space just to the right of the player and stops it moving, so shots can be aimed at it.
function parkDroneNextToPlayer(game, gapMetres) {
  game.drone.position = add(game.player.position, { x: game.player.bodyRadius + game.drone.bodyRadius + gapMetres, y: 0 });
  game.drone.waypoint = { ...game.drone.position };
  game.settings.drone.cruiseSpeed = 0;
}

function stepFor(game, controls, seconds) {
  for (let step = 0; step < Math.round(seconds / stepSeconds); step += 1) stepGame(game, controls, stepSeconds);
}

test('holding fire shoots blaster shots at the aim point, one per cooldown', async () => {
  const game = await newGame();
  const aimPoint = add(game.player.position, { x: 0, y: -10 });
  stepFor(game, { ...noControls, fireHeld: true, aimPoint }, game.settings.weapons.blaster.cooldownSeconds * 1.5);
  assert.equal(game.projectiles.length, 2);
  assert.ok(game.projectiles.every((projectile) => projectile.velocity.y < 0));
});

test('a blaster shot that hits the drone damages it and pushes it', async () => {
  const game = await newGame();
  parkDroneNextToPlayer(game, 1);
  stepFor(game, { ...noControls, fireHeld: true, aimPoint: game.drone.position }, stepSeconds);
  stepFor(game, noControls, 0.3);
  assert.equal(game.drone.vitals.health, game.settings.rules.maxHealth - game.settings.weapons.blaster.damage);
  assert.ok(game.drone.knockbackVelocity.x > 0);
  assert.equal(game.projectiles.length, 0);
});

test('a character is never hit by its own shot', () => {
  const shooter = { id: 'player', bodyRadius: 0.4, position: { x: 5, y: 5 }, vitals: { state: 'alive' } };
  const shot = createProjectile(shooter, { x: 1, y: 0 }, { projectileRadius: 0.1, projectileSpeed: 0, damage: 10, knockbackSpeed: 0, gravityScale: 0, projectileLifetimeSeconds: 1 });
  shot.position = { ...shooter.position };
  const bounds = { minimumX: 0, minimumY: 0, maximumX: 10, maximumY: 10 };
  assert.deepEqual(updateProjectiles([shot], stepSeconds, [], [shooter], bounds), []);
});

test('shots are stopped by comets', async () => {
  const game = await newGame();
  const cometUnderfoot = game.comets[game.player.groundedCometIndex];
  stepFor(game, { ...noControls, fireHeld: true, aimPoint: cometUnderfoot.centre }, stepSeconds);
  assert.ok(game.player.arsenal.cooldownSecondsRemaining > 0, 'the shot was fired');
  assert.equal(game.projectiles.length, 0);
});

test('shots curve under comet gravity', async () => {
  const game = await newGame();
  const shot = createProjectile(game.player, { x: 1, y: 0 }, game.settings.weapons.blaster);
  const straightLineEnd = add(shot.position, scale(shot.velocity, 0.2));
  updateProjectiles([shot], 0.2, game.comets, [], game.outerBounds);
  assert.notDeepEqual(shot.position, straightLineEnd);
});

test('touching a crate gives the heavy cannon', async () => {
  const game = await newGame();
  game.crateSpawner.crates.push({ angleOnComet: 0, position: { ...game.player.position } });
  stepFor(game, noControls, stepSeconds);
  assert.equal(selectedWeapon(game.player.arsenal).weaponName, 'heavyCannon');
  assert.equal(game.crateSpawner.crates.length, 0);
});

test('crates appear on a comet surface after the spawn interval', async () => {
  const game = await newGame();
  stepFor(game, noControls, game.settings.crates.spawnIntervalSeconds + 0.1);
  assert.equal(game.crateSpawner.crates.length, 1);
});

test('drifting off the map costs the player a life, then they respawn on a comet with only the blaster', async () => {
  const game = await newGame();
  game.player.arsenal.carriedWeapons.push({ weaponName: 'heavyCannon', ammoRemaining: 3 });
  game.player.movementMode = 'airborne';
  game.player.position = { x: -100, y: -100 };
  stepFor(game, noControls, stepSeconds);
  assert.equal(game.player.vitals.livesRemaining, game.settings.rules.startingLives - 1);
  stepFor(game, noControls, game.settings.rules.respawnDelaySeconds + 0.1);
  assert.equal(game.player.vitals.state, 'alive');
  assert.equal(game.player.movementMode, 'grounded');
  assert.equal(game.player.arsenal.carriedWeapons.length, 1);
});

test('destroying the drone on its last life ends the game as a win', async () => {
  const game = await newGame();
  parkDroneNextToPlayer(game, 1);
  game.drone.vitals.livesRemaining = 1;
  game.drone.vitals.health = game.settings.weapons.blaster.damage;
  stepFor(game, { ...noControls, fireHeld: true, aimPoint: game.drone.position }, stepSeconds);
  stepFor(game, noControls, 0.3);
  assert.equal(game.outcome, 'targetDestroyed');
});

test('the player running out of lives ends the game as a loss, and the game then stops changing', async () => {
  const game = await newGame();
  game.player.vitals.livesRemaining = 1;
  game.player.position = { x: -100, y: -100 };
  game.player.movementMode = 'airborne';
  stepFor(game, noControls, stepSeconds);
  assert.equal(game.outcome, 'playerOutOfLives');
  const droneBefore = { ...game.drone.position };
  stepFor(game, noControls, 1);
  assert.deepEqual(game.drone.position, droneBefore);
});
