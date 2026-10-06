// One whole game: comets, fighters, the drone, shots, crates, and the rules that tie them together. No drawing or
// browser code here, so it can all be tested with node.
import { settings as defaultSettings } from './settings.js';
import { createComets } from './gravity.js';
import { add, subtract, normalize, length } from './vector.js';
import { createFighter, placeOnComet, updateFighterMovement, launchIntoAir } from './fighter.js';
import { createBotBrain, decideBotControls } from './bot.js';
import { createDrone, placeDroneAtRandomFreeSpot, updateDrone, takeVolleyDirections } from './drone.js';
import { createArsenal, updateArsenalCooldown, selectNextWeapon, tryFire, giveWeapon, weaponsThatFire } from './weapons.js';
import { createProjectile, updateProjectiles, isInsideBounds, knockbackVelocityOf, muzzleSpeedFor } from './projectiles.js';
import { createCrateSpawner, updateCrates, collectTouchedCrates, dropLootCrate } from './crates.js';
import { isAlive, applyDamage, loseLife, updateVitals } from './vitals.js';

export function createGame(gameSettings = defaultSettings, random = Math.random) {
  const { world, rules } = gameSettings;
  const margin = world.outOfBoundsMarginMetres;
  const player = createFighter('player', 'human', gameSettings.fighter, rules);
  const bot = createFighter('bot', 'bot', gameSettings.fighter, rules);
  bot.botBrain = createBotBrain();
  // The drone never runs out of lives and has its own respawn wait.
  const droneRules = { ...rules, startingLives: Infinity, respawnDelaySeconds: gameSettings.drone.respawnDelaySeconds };
  const drone = gameSettings.drone.includeInMatch ? createDrone('drone', gameSettings.drone, droneRules) : null;
  const game = {
    settings: gameSettings,
    random,
    comets: createComets(gameSettings.cometLayout, gameSettings.physics.cometSurfaceGravity),
    // Leaving this area costs a fighter a life, or ends a shot.
    outerBounds: { minimumX: -margin, minimumY: -margin, maximumX: world.widthMetres + margin, maximumY: world.heightMetres + margin },
    player,
    bot,
    fighters: [player, bot],
    drone,
    // Everything that can be shot.
    characters: [player, bot, drone].filter(Boolean),
    projectiles: [],
    crateSpawner: createCrateSpawner(gameSettings.crates),
    // null while playing; { winnerId } once only one fighter (or none: winnerId null, a draw) has lives left.
    outcome: null,
  };
  for (const fighter of game.fighters) respawnFighter(game, fighter);
  if (drone) placeDroneAtRandomFreeSpot(drone, game.comets, world, gameSettings.drone, random);
  return game;
}

// Respawns on top of a random comet that no other fighter is standing on, carrying only the starting weapon.
function respawnFighter(game, fighter) {
  const occupiedCometIndexes = game.fighters
    .filter((other) => other !== fighter && isAlive(other.vitals) && other.movementMode === 'grounded')
    .map((other) => other.groundedCometIndex);
  const allCometIndexes = game.comets.map((_, cometIndex) => cometIndex);
  const freeCometIndexes = allCometIndexes.filter((cometIndex) => !occupiedCometIndexes.includes(cometIndex));
  const choices = freeCometIndexes.length > 0 ? freeCometIndexes : allCometIndexes;
  placeOnComet(fighter, game.comets, choices[Math.floor(game.random() * choices.length)], -Math.PI / 2);
  fighter.arsenal = createArsenal();
}

const idleControls = { runDirection: 0, jumpRequested: false, fireHeld: false, aimPoint: { x: 0, y: 0 }, switchWeaponRequested: false };

// controlsByFighterId: e.g. { player: { runDirection, jumpRequested, fireHeld, aimPoint, switchWeaponRequested } }.
// A bot with no controls given decides its own; a human with none given stands idle.
export function stepGame(game, controlsByFighterId, stepSeconds) {
  if (game.outcome) return;
  const { settings, drone, comets, random } = game;

  for (const fighter of game.fighters) {
    if (updateVitals(fighter.vitals, stepSeconds, fighter.rules)) respawnFighter(game, fighter);
  }
  if (drone && updateVitals(drone.vitals, stepSeconds, drone.rules)) {
    placeDroneAtRandomFreeSpot(drone, comets, settings.world, settings.drone, random);
  }

  for (const fighter of game.fighters) {
    if (!isAlive(fighter.vitals)) continue;
    const controls = controlsByFighterId[fighter.id]
      ?? (fighter.controlledBy === 'bot' ? decideBotControls(game, fighter, stepSeconds) : idleControls);
    stepFighter(game, fighter, controls, stepSeconds);
  }

  if (drone && isAlive(drone.vitals)) {
    updateDrone(drone, stepSeconds, comets, settings.world, settings.drone, random);
    for (const direction of takeVolleyDirections(drone, stepSeconds, settings.drone)) {
      game.projectiles.push(createProjectile(drone, direction, settings.drone.volleyShot));
    }
  }

  const hits = updateProjectiles(game.projectiles, stepSeconds, comets, game.characters, game.outerBounds);
  for (const { projectile, target } of hits) applyHit(game, target, projectile);

  updateCrates(game.crateSpawner, stepSeconds, comets, settings.crates, random);

  const fightersStillIn = game.fighters.filter((fighter) => fighter.vitals.state !== 'eliminated');
  if (fightersStillIn.length <= 1) game.outcome = { winnerId: fightersStillIn[0]?.id ?? null };
}

function stepFighter(game, fighter, controls, stepSeconds) {
  const { settings } = game;
  fighter.aimPoint = controls.aimPoint;
  if (controls.switchWeaponRequested) selectNextWeapon(fighter.arsenal);
  updateFighterMovement(fighter, controls, stepSeconds, game.comets, settings.fighter);
  updateArsenalCooldown(fighter.arsenal, stepSeconds);
  if (controls.fireHeld) fireTowards(game, fighter, controls.aimPoint);
  for (const crate of collectTouchedCrates(game.crateSpawner, fighter, settings.crates)) {
    for (const weaponName of crate.weaponNames) giveWeapon(fighter.arsenal, weaponName, settings.weapons);
  }
  if (!isInsideBounds(fighter.position, game.outerBounds)) loseLife(fighter.vitals, fighter.rules);
}

// The aim point sets the direction, and (for weapons with adjustable power) its distance sets the speed.
// Only the selected weapon's ammo is used, even when it fires several weapons at once.
function fireTowards(game, shooter, aimPoint) {
  const { weapons, aiming } = game.settings;
  const aimOffset = subtract(aimPoint, shooter.position);
  if (length(aimOffset) === 0) return;
  // Worked out before firing, since firing a weapon's last shot drops it.
  const firingWeaponNames = weaponsThatFire(shooter.arsenal, weapons);
  if (!tryFire(shooter.arsenal, weapons)) return;
  for (const weaponName of firingWeaponNames) {
    const muzzleSpeed = muzzleSpeedFor(weapons[weaponName], length(aimOffset), aiming);
    game.projectiles.push(createProjectile(shooter, normalize(aimOffset), weapons[weaponName], muzzleSpeed));
  }
}

// Damage, then knockback if the target survived. A target under respawn protection takes neither.
// A destroyed drone drops a loot crate where it was.
export function applyHit(game, target, projectile) {
  const protectedFromHarm = target.vitals.protectionSecondsRemaining > 0;
  const lostLife = applyDamage(target.vitals, projectile.damage, target.rules);
  if (lostLife && target.kind === 'drone') dropLootCrate(game.crateSpawner, target.position, game.settings.drone, game.random);
  if (protectedFromHarm || lostLife) return;
  const knockback = knockbackVelocityOf(projectile);
  if (target.kind === 'fighter') launchIntoAir(target, knockback);
  else target.knockbackVelocity = add(target.knockbackVelocity, knockback);
}
