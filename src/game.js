// One whole game: comets, characters, shots, crates, and the rules that tie them together. No drawing or browser
// code here, so it can all be tested with node.
import { settings as defaultSettings } from './settings.js';
import { createComets } from './gravity.js';
import { add, subtract, normalize, length } from './vector.js';
import { createPlayer, placeOnComet, updatePlayerMovement, launchIntoAir } from './player.js';
import { createDrone, placeDroneAtRandomFreeSpot, updateDrone } from './drone.js';
import { createArsenal, updateArsenalCooldown, selectNextWeapon, tryFire, giveWeapon } from './weapons.js';
import { createProjectile, updateProjectiles, isInsideBounds, knockbackVelocityOf } from './projectiles.js';
import { createCrateSpawner, updateCrateSpawner, collectTouchedCrates } from './crates.js';
import { isAlive, applyDamage, loseLife, updateVitals } from './vitals.js';

export function createGame(gameSettings = defaultSettings, random = Math.random) {
  const { world } = gameSettings;
  const margin = world.outOfBoundsMarginMetres;
  const game = {
    settings: gameSettings,
    random,
    comets: createComets(gameSettings.cometLayout, gameSettings.physics.cometSurfaceGravity),
    // Leaving this area costs a life (players) or ends a shot.
    outerBounds: { minimumX: -margin, minimumY: -margin, maximumX: world.widthMetres + margin, maximumY: world.heightMetres + margin },
    player: createPlayer('player', gameSettings.player, gameSettings.rules),
    drone: createDrone('drone', gameSettings.drone, gameSettings.rules),
    projectiles: [],
    crateSpawner: createCrateSpawner(gameSettings.crates),
    // null while playing; 'playerOutOfLives' or 'targetDestroyed' once the game is over.
    outcome: null,
  };
  game.characters = [game.player, game.drone];
  respawnPlayer(game);
  placeDroneAtRandomFreeSpot(game.drone, game.comets, world, gameSettings.drone, random);
  return game;
}

// Respawns on top of a random comet, carrying only the starting weapon.
function respawnPlayer(game) {
  const cometIndex = Math.floor(game.random() * game.comets.length);
  placeOnComet(game.player, game.comets, cometIndex, -Math.PI / 2);
  game.player.arsenal = createArsenal();
}

// controls: { runDirection, jumpRequested, fireHeld, aimPoint (in world metres), switchWeaponRequested }
export function stepGame(game, controls, stepSeconds) {
  if (game.outcome) return;
  const { settings, player, drone, comets, random } = game;

  if (updateVitals(player.vitals, stepSeconds, settings.rules)) respawnPlayer(game);
  if (updateVitals(drone.vitals, stepSeconds, settings.rules)) {
    placeDroneAtRandomFreeSpot(drone, comets, settings.world, settings.drone, random);
  }

  if (isAlive(player.vitals)) {
    if (controls.switchWeaponRequested) selectNextWeapon(player.arsenal);
    updatePlayerMovement(player, controls, stepSeconds, comets, settings.player);
    updateArsenalCooldown(player.arsenal, stepSeconds);
    if (controls.fireHeld) fireTowards(game, player, controls.aimPoint);
    if (collectTouchedCrates(game.crateSpawner, player, settings.crates) > 0) {
      giveWeapon(player.arsenal, settings.crates.weaponInside, settings.weapons);
    }
    if (!isInsideBounds(player.position, game.outerBounds)) loseLife(player.vitals, settings.rules);
  }

  if (isAlive(drone.vitals)) updateDrone(drone, stepSeconds, comets, settings.world, settings.drone, random);

  const hits = updateProjectiles(game.projectiles, stepSeconds, comets, game.characters, game.outerBounds);
  for (const { projectile, target } of hits) applyHit(game, target, projectile);

  updateCrateSpawner(game.crateSpawner, stepSeconds, comets, settings.crates, random);

  if (player.vitals.state === 'eliminated') game.outcome = 'playerOutOfLives';
  else if (drone.vitals.state === 'eliminated') game.outcome = 'targetDestroyed';
}

function fireTowards(game, shooter, aimPoint) {
  const aimOffset = subtract(aimPoint, shooter.position);
  if (length(aimOffset) === 0) return;
  const weaponDefinition = tryFire(shooter.arsenal, game.settings.weapons);
  if (weaponDefinition) game.projectiles.push(createProjectile(shooter, normalize(aimOffset), weaponDefinition));
}

// Damage, then knockback if the target survived. A target under respawn protection takes neither.
export function applyHit(game, target, projectile) {
  const protectedFromHarm = target.vitals.protectionSecondsRemaining > 0;
  const lostLife = applyDamage(target.vitals, projectile.damage, game.settings.rules);
  if (protectedFromHarm || lostLife) return;
  const knockback = knockbackVelocityOf(projectile);
  if (target.kind === 'player') launchIntoAir(target, knockback);
  else target.knockbackVelocity = add(target.knockbackVelocity, knockback);
}
