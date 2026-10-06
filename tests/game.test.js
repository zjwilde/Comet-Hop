// Whole-game behaviour: shooting, hits, crates and loot, the drone, lives, and how a match ends.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createGame, stepGame } from '../src/game.js';
import { createProjectile, updateProjectiles } from '../src/projectiles.js';
import { add, scale, distance } from '../src/vector.js';
import { selectedWeapon, giveWeapon } from '../src/weapons.js';
import { HumanController, IdleController } from '../src/controllers.js';
import { copyOfSettings, createSeededRandom, noControls } from './helpers.js';

const stepSeconds = 1 / 120;

// A game where the bot stands idle and (unless asked for) there is no drone, so tests control everything that happens.
async function quietGame({ withDrone = false, seed = 1, selfDamage = false } = {}) {
  const settings = await copyOfSettings();
  settings.drone.includeInMatch = withDrone;
  settings.rules.shotsCanHurtTheirShooter = selfDamage;
  const game = createGame(settings, createSeededRandom(seed));
  game.bot.controller = new IdleController();
  return game;
}

// Steps the game with the player holding the given controls throughout.
function stepFor(game, playerControls, seconds) {
  game.player.controller = new HumanController(() => playerControls);
  for (let step = 0; step < Math.round(seconds / stepSeconds); step += 1) stepGame(game, stepSeconds);
}

// Moves the bot into open space just to the right of the player, so shots can be aimed at it.
function parkBotNextToPlayer(game, gapMetres) {
  game.bot.movementMode = 'airborne';
  game.bot.groundedCometIndex = null;
  game.bot.position = add(game.player.position, { x: game.player.bodyRadius + game.bot.bodyRadius + gapMetres, y: 0 });
  game.bot.velocity = { x: 0, y: 0 };
}

test('holding fire shoots blaster shots at the aim point, one per cooldown', async () => {
  const game = await quietGame();
  const aimPoint = add(game.player.position, { x: 0, y: -10 });
  stepFor(game, { ...noControls, fireHeld: true, aimPoint }, game.settings.weapons.blaster.cooldownSeconds * 1.5);
  assert.equal(game.projectiles.length, 2);
  assert.ok(game.projectiles.every((projectile) => projectile.velocity.y < 0));
});

test('a blaster shot that hits the bot damages it and knocks it back', async () => {
  const game = await quietGame();
  parkBotNextToPlayer(game, 1);
  stepFor(game, { ...noControls, fireHeld: true, aimPoint: game.bot.position }, stepSeconds);
  stepFor(game, noControls, 0.2);
  assert.equal(game.bot.vitals.health, game.settings.rules.maxHealth - game.settings.weapons.blaster.damage);
  assert.ok(game.bot.velocity.x > 0);
  assert.equal(game.projectiles.length, 0);
});

test('a character is never hit by its own shot', () => {
  const shooter = { id: 'player', bodyRadius: 0.4, position: { x: 5, y: 5 }, vitals: { state: 'alive' } };
  const shot = createProjectile(shooter, { x: 1, y: 0 }, { projectileRadius: 0.1, projectileSpeed: 0, damage: 10, knockbackSpeed: 0, gravityScale: 0, projectileLifetimeSeconds: 1, passesThroughComets: false, eruption: null });
  shot.position = { ...shooter.position };
  const bounds = { minimumX: 0, minimumY: 0, maximumX: 10, maximumY: 10 };
  assert.deepEqual(updateProjectiles([shot], stepSeconds, [], [shooter], bounds).hits, []);
});

test('ordinary shots are stopped by comets', async () => {
  const game = await quietGame();
  const cometUnderfoot = game.comets[game.player.groundedCometIndex];
  stepFor(game, { ...noControls, fireHeld: true, aimPoint: cometUnderfoot.centre }, stepSeconds);
  assert.ok(game.player.arsenal.cooldownSecondsRemaining > 0, 'the shot was fired');
  assert.equal(game.projectiles.length, 0);
});

test('touching a crate gives the weapon inside, selected', async () => {
  const game = await quietGame();
  game.crateSpawner.crates.push({ floating: false, cometIndex: 0, angleOnComet: 0, position: { ...game.player.position }, weaponNames: ['drill'], secondsRemaining: null });
  stepFor(game, noControls, stepSeconds);
  assert.equal(selectedWeapon(game.player.arsenal).weaponName, 'drill');
  assert.equal(game.crateSpawner.crates.length, 0);
});

test('ordinary crates appear on comet surfaces, holding one of the crate weapons', async () => {
  const game = await quietGame();
  stepFor(game, noControls, game.settings.crates.spawnIntervalSeconds + 0.1);
  assert.equal(game.crateSpawner.crates.length, 1);
  const [crate] = game.crateSpawner.crates;
  const comet = game.comets[crate.cometIndex];
  assert.ok(Math.abs(distance(crate.position, comet.centre) - (comet.radius + game.settings.crates.size / 2)) < 1e-9);
  assert.ok(game.settings.crates.weaponsInside.includes(crate.weaponNames[0]));
});

test('drifting off the map costs a life, then the fighter respawns on a comet with only the blaster', async () => {
  const game = await quietGame();
  giveWeapon(game.player.arsenal, 'drill', game.settings.weapons);
  game.player.movementMode = 'airborne';
  game.player.position = { x: -100, y: -100 };
  stepFor(game, noControls, stepSeconds);
  assert.equal(game.player.vitals.livesRemaining, game.settings.rules.startingLives - 1);
  stepFor(game, noControls, game.settings.rules.respawnDelaySeconds + 0.1);
  assert.equal(game.player.vitals.state, 'alive');
  assert.equal(game.player.movementMode, 'grounded');
  assert.equal(game.player.arsenal.carriedWeapons.length, 1);
});

test('fighters start on different comets', async () => {
  for (let seed = 1; seed <= 20; seed += 1) {
    const game = await quietGame({ seed });
    assert.notEqual(game.player.groundedCometIndex, game.bot.groundedCometIndex);
  }
});

test('the last fighter with lives left wins, and the game then stops changing', async () => {
  const game = await quietGame();
  game.bot.vitals.livesRemaining = 1;
  game.bot.movementMode = 'airborne';
  game.bot.position = { x: -100, y: -100 };
  stepFor(game, noControls, stepSeconds);
  assert.deepEqual(game.outcome, { winnerId: 'player' });
  const playerPositionBefore = { ...game.player.position };
  stepFor(game, { ...noControls, runDirection: 1 }, 1);
  assert.deepEqual(game.player.position, playerPositionBefore);
});

test('if both fighters lose their last life on the same step, it is a draw', async () => {
  const game = await quietGame();
  for (const fighter of game.fighters) {
    fighter.vitals.livesRemaining = 1;
    fighter.movementMode = 'airborne';
    fighter.position = { x: -100, y: -100 };
  }
  stepFor(game, noControls, stepSeconds);
  assert.deepEqual(game.outcome, { winnerId: null });
});

test('the drone fires a ring of shots in every direction, at a fixed interval', async () => {
  const game = await quietGame({ withDrone: true });
  const { drone: droneSettings } = game.settings;
  stepFor(game, noControls, droneSettings.secondsBetweenVolleys - 0.05);
  assert.equal(game.projectiles.filter((projectile) => projectile.ownerId === 'drone').length, 0);
  // Step until the volley appears, so the shots haven't yet been bent by gravity.
  for (let step = 0; step < 20 && !game.projectiles.some((projectile) => projectile.ownerId === 'drone'); step += 1) {
    stepFor(game, noControls, stepSeconds);
  }
  const volley = game.projectiles.filter((projectile) => projectile.ownerId === 'drone');
  assert.equal(volley.length, droneSettings.shotsPerVolley);
  const angles = volley.map((projectile) => Math.atan2(projectile.velocity.y, projectile.velocity.x)).sort((first, second) => first - second);
  const gap = (2 * Math.PI) / droneSettings.shotsPerVolley;
  // Within a hair: each shot has already had one physics step of gravity.
  for (let index = 1; index < angles.length; index += 1) assert.ok(Math.abs(angles[index] - angles[index - 1] - gap) < 0.01);
});

test('the drone never runs out of lives and does not count towards winning', async () => {
  const game = await quietGame({ withDrone: true });
  for (let death = 0; death < 10; death += 1) {
    game.drone.vitals.health = 1;
    game.drone.vitals.protectionSecondsRemaining = 0;
    const shot = createProjectile(game.player, { x: 1, y: 0 }, game.settings.weapons.blaster);
    shot.position = { ...game.drone.position };
    game.projectiles.push(shot);
    stepFor(game, noControls, stepSeconds);
    assert.equal(game.drone.vitals.state, 'waitingToRespawn');
    stepFor(game, noControls, game.settings.drone.respawnDelaySeconds + 0.1);
    assert.equal(game.drone.vitals.state, 'alive');
  }
  assert.equal(game.outcome, null);
});

test('destroying the drone drops a floating loot crate (a bonus weapon plus the Barrage) that vanishes if left', async () => {
  const game = await quietGame({ withDrone: true });
  game.drone.vitals.health = 1;
  const whereItDied = { ...game.drone.position };
  const shot = createProjectile(game.player, { x: 1, y: 0 }, game.settings.weapons.blaster);
  shot.position = { ...game.drone.position };
  game.projectiles.push(shot);
  stepFor(game, noControls, stepSeconds);
  const loot = game.crateSpawner.crates.find((crate) => crate.floating);
  assert.ok(loot);
  // The drone moves a fraction during the step before the shot lands.
  assert.ok(distance(loot.position, whereItDied) < 0.1);
  assert.ok(game.settings.drone.lootBonusWeapons.includes(loot.weaponNames[0]));
  assert.equal(loot.weaponNames[1], 'barrage');
  stepFor(game, noControls, game.settings.drone.lootLifetimeSeconds + 0.1);
  assert.ok(!game.crateSpawner.crates.includes(loot));
});

test('collecting loot gives the bonus weapon and the Barrage, with the Barrage selected', async () => {
  const game = await quietGame();
  game.crateSpawner.crates.push({ floating: true, cometIndex: null, angleOnComet: 0, position: { ...game.player.position }, weaponNames: ['volcanoBomb', 'barrage'], secondsRemaining: 20 });
  stepFor(game, noControls, stepSeconds);
  const carriedNames = game.player.arsenal.carriedWeapons.map((carried) => carried.weaponName);
  assert.deepEqual(carriedNames, ['blaster', 'volcanoBomb', 'barrage']);
  assert.equal(selectedWeapon(game.player.arsenal).weaponName, 'barrage');
});

test('a Barrage shot fires every other carried weapon at once, using only Barrage ammo', async () => {
  const game = await quietGame();
  const { weapons } = game.settings;
  giveWeapon(game.player.arsenal, 'drill', weapons);
  giveWeapon(game.player.arsenal, 'barrage', weapons);
  const aimPoint = add(game.player.position, { x: 0, y: -5 });
  stepFor(game, { ...noControls, fireHeld: true, aimPoint }, stepSeconds);
  assert.equal(game.projectiles.length, 2, 'one blaster shot and one drill');
  assert.ok(game.projectiles.some((projectile) => projectile.shape === 'drill'));
  const drill = game.player.arsenal.carriedWeapons.find((carried) => carried.weaponName === 'drill');
  assert.equal(drill.ammoRemaining, weapons.drill.ammoPerPickup);
  assert.equal(selectedWeapon(game.player.arsenal).ammoRemaining, weapons.barrage.ammoPerPickup - 1);
});

test('the Barrage is dropped after its shots run out, leaving the other weapons untouched', async () => {
  const game = await quietGame();
  const { weapons } = game.settings;
  giveWeapon(game.player.arsenal, 'heavyCannon', weapons);
  giveWeapon(game.player.arsenal, 'barrage', weapons);
  const aimPoint = add(game.player.position, { x: 0, y: -5 });
  for (let shot = 0; shot < weapons.barrage.ammoPerPickup; shot += 1) {
    stepFor(game, { ...noControls, fireHeld: true, aimPoint }, stepSeconds);
    game.player.arsenal.cooldownSecondsRemaining = 0;
  }
  const carriedNames = game.player.arsenal.carriedWeapons.map((carried) => carried.weaponName);
  assert.deepEqual(carriedNames, ['blaster', 'heavyCannon']);
  assert.equal(game.player.arsenal.carriedWeapons[1].ammoRemaining, weapons.heavyCannon.ammoPerPickup);
});

test('mouse distance sets the speed of an adjustable-power weapon', async () => {
  const game = await quietGame();
  const { weapons, aiming } = game.settings;
  giveWeapon(game.player.arsenal, 'volcanoBomb', weapons);
  const halfPowerAim = add(game.player.position, { x: 0, y: -aiming.mouseDistanceForFullPower / 2 });
  stepFor(game, { ...noControls, fireHeld: true, aimPoint: halfPowerAim }, stepSeconds);
  const range = weapons.volcanoBomb.muzzleSpeedRange;
  const speed = Math.hypot(game.projectiles[0].velocity.x, game.projectiles[0].velocity.y);
  // One physics step of gravity has already changed the speed very slightly.
  assert.ok(Math.abs(speed - (range.slowest + range.fastest) / 2) < 0.2);
});

test('shots curve under comet gravity', async () => {
  const game = await quietGame();
  const shot = createProjectile(game.player, { x: 1, y: 0 }, game.settings.weapons.blaster);
  const straightLineEnd = add(shot.position, scale(shot.velocity, 0.2));
  updateProjectiles([shot], 0.2, game.comets, [], game.outerBounds);
  assert.notDeepEqual(shot.position, straightLineEnd);
});

test('a drill fired down through your own comet blasts a fighter standing on the far side, but never the shooter', async () => {
  const game = await quietGame();
  const cometIndex = game.player.groundedCometIndex;
  const comet = game.comets[cometIndex];
  game.bot.placeOnComet(game.comets, cometIndex, Math.PI / 2);
  giveWeapon(game.player.arsenal, 'drill', game.settings.weapons);
  stepFor(game, { ...noControls, fireHeld: true, aimPoint: comet.centre }, stepSeconds);
  // Once the drill is on its way, the shooter runs round to near where it will come out.
  game.player.placeOnComet(game.comets, cometIndex, Math.PI / 2 + 0.6);
  for (let step = 0; step < 240 && game.effects.length === 0; step += 1) stepFor(game, noControls, stepSeconds);
  assert.equal(game.effects.length, 1, 'detonated');
  const { detonation } = game.settings.weapons.drill;
  assert.ok(Math.abs(game.bot.vitals.health - (game.settings.rules.maxHealth - detonation.damageAtCentre)) < 1, 'full blast damage');
  assert.equal(game.bot.movementMode, 'airborne', 'knocked off the comet');
  assert.ok(game.bot.velocity.y > 0, 'pushed away from the blast, downward here');
  assert.equal(game.player.vitals.health, game.settings.rules.maxHealth, 'the shooter is unharmed');
});

// Fires a volcano bomb straight down at the player's own feet and lets the fragments land.
async function volcanoBombAtOwnFeet(selfDamage) {
  const game = await quietGame({ selfDamage });
  giveWeapon(game.player.arsenal, 'volcanoBomb', game.settings.weapons);
  const comet = game.comets[game.player.groundedCometIndex];
  stepFor(game, { ...noControls, fireHeld: true, aimPoint: comet.centre }, stepSeconds);
  stepFor(game, noControls, 2);
  return game;
}

test('self-damage off (the default): your own volcano fragments land on you harmlessly', async () => {
  const game = await volcanoBombAtOwnFeet(false);
  assert.equal(game.player.vitals.health, game.settings.rules.maxHealth);
});

test('self-damage on: your own volcano fragments hurt you', async () => {
  const game = await volcanoBombAtOwnFeet(true);
  assert.ok(game.player.vitals.health < game.settings.rules.maxHealth);
});

test('self-damage on: your own drill blast hurts you if you stand where it comes out', async () => {
  const game = await quietGame({ selfDamage: true });
  const cometIndex = game.player.groundedCometIndex;
  giveWeapon(game.player.arsenal, 'drill', game.settings.weapons);
  stepFor(game, { ...noControls, fireHeld: true, aimPoint: game.comets[cometIndex].centre }, stepSeconds);
  game.player.placeOnComet(game.comets, cometIndex, Math.PI / 2);
  for (let step = 0; step < 240 && game.effects.length === 0; step += 1) stepFor(game, noControls, stepSeconds);
  assert.ok(game.player.vitals.health < game.settings.rules.maxHealth);
});

test('self-damage on: a shot never hits its shooter as it leaves, even one outrunning it, but can once clear', () => {
  const shooter = { id: 'player', bodyRadius: 0.4, position: { x: 5, y: 5 }, vitals: { state: 'alive' } };
  const slowShot = { projectileRadius: 0.1, projectileSpeed: 2, damage: 10, knockbackSpeed: 0, gravityScale: 0, projectileLifetimeSeconds: 5, passesThroughComets: false, eruption: null };
  const bounds = { minimumX: -50, minimumY: -50, maximumX: 50, maximumY: 50 };
  const projectiles = [createProjectile(shooter, { x: 1, y: 0 }, slowShot, 2, true)];
  // A fighter flying the same way faster than its own slow shot runs right through it: no hit.
  for (let step = 0; step < 40; step += 1) {
    shooter.position = { x: shooter.position.x + 0.05, y: 5 };
    assert.deepEqual(updateProjectiles(projectiles, stepSeconds, [], [shooter], bounds).hits, [], `step ${step}`);
  }
  // Well clear of it now; then stepping back into its path is a hit.
  shooter.position = { x: projectiles[0].position.x + 0.3, y: 5 };
  const { hits } = updateProjectiles(projectiles, stepSeconds, [], [shooter], bounds);
  assert.equal(hits.length, 1);
  assert.equal(hits[0].target, shooter);
});

test('a tap while the weapon is cooling down does nothing, then or later', async () => {
  const game = await quietGame();
  giveWeapon(game.player.arsenal, 'heavyCannon', game.settings.weapons);
  const aimPoint = add(game.player.position, { x: 0, y: -10 });
  // Counted from ammo used, since shots leave the map and disappear.
  const cannonShotsSoFar = () => game.settings.weapons.heavyCannon.ammoPerPickup - game.player.arsenal.carriedWeapons[1].ammoRemaining;
  stepFor(game, { ...noControls, firePressed: true, aimPoint }, stepSeconds);
  assert.equal(cannonShotsSoFar(), 1);
  stepFor(game, { ...noControls, aimPoint }, game.settings.weapons.heavyCannon.cooldownSeconds - 0.1);
  stepFor(game, { ...noControls, firePressed: true, aimPoint }, stepSeconds);
  stepFor(game, { ...noControls, aimPoint }, 1);
  assert.equal(cannonShotsSoFar(), 1, 'the tap during cooldown never fired');
});

test('every fire press registers on screen, even one that cannot fire yet', async () => {
  const game = await quietGame();
  const aimPoint = add(game.player.position, { x: 0, y: -10 });
  stepFor(game, { ...noControls, firePressed: true, aimPoint }, stepSeconds);
  stepFor(game, { ...noControls, aimPoint }, 0.05);
  stepFor(game, { ...noControls, firePressed: true, aimPoint }, stepSeconds);
  assert.ok(game.player.arsenal.cooldownSecondsRemaining > 0, 'still cooling down');
  assert.ok(game.player.secondsSinceFirePress < 0.02, 'but the press was seen');
});
