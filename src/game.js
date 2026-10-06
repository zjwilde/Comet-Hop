// One whole game: comets, characters (fighters and drones), shots, crates, and the rules that tie them together.
// Each character handles its own behaviour (see character.js); this file runs them in order and settles hits and the
// match result. No drawing or browser code here, so it can all be tested with node.
import { settings as defaultSettings } from './settings.js';
import { createComets } from './gravity.js';
import { Fighter } from './fighter.js';
import { IdleController } from './controllers.js';
import { BotController } from './bot.js';
import { HazardDrone } from './hazard-drone.js';
import { updateProjectiles, knockbackVelocityOf, blastStrengthAt } from './projectiles.js';
import { subtract, normalize, scale } from './vector.js';
import { createCrateSpawner, updateCrates } from './crates.js';
import { updateVitals } from './vitals.js';

// playerController: what drives the player's fighter (the browser passes one reading the keyboard and mouse).
export function createGame(gameSettings = defaultSettings, random = Math.random, playerController = new IdleController()) {
  const { world, rules } = gameSettings;
  const margin = world.outOfBoundsMarginMetres;
  const player = new Fighter('player', playerController, gameSettings.fighter, rules);
  const bot = new Fighter('bot', new BotController(), gameSettings.fighter, rules);
  // The drone never runs out of lives and has its own respawn wait.
  const droneRules = { ...rules, startingLives: Infinity, respawnDelaySeconds: gameSettings.drone.respawnDelaySeconds };
  const drone = gameSettings.drone.includeInMatch ? new HazardDrone('drone', gameSettings.drone, droneRules) : null;
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
    // Everything that can be shot, in the order it acts each step.
    characters: [player, bot, drone].filter(Boolean),
    projectiles: [],
    // Short-lived visual effects, such as blast flashes: { position, radius, colour, secondsRemaining, totalSeconds }.
    effects: [],
    // Where main shots came down on the latest step (see updateProjectiles), for the bot to learn from its misses.
    latestLandings: [],
    crateSpawner: createCrateSpawner(gameSettings.crates),
    // null while playing; { winnerId } once only one fighter (or none: winnerId null, a draw) has lives left.
    outcome: null,
  };
  for (const character of game.characters) character.respawn(game);
  return game;
}

export function stepGame(game, stepSeconds) {
  if (game.outcome) return;

  for (const character of game.characters) {
    if (updateVitals(character.vitals, stepSeconds, character.rules)) character.respawn(game);
  }
  for (const character of game.characters) {
    if (character.isAlive()) character.update(game, stepSeconds);
  }

  const { hits, blasts, landings } = updateProjectiles(game.projectiles, stepSeconds, game.comets, game.characters, game.outerBounds);
  for (const { projectile, target } of hits) target.takeHit(game, projectile.damage, knockbackVelocityOf(projectile));
  for (const blast of blasts) applyBlast(game, blast);
  game.latestLandings = landings;
  for (const effect of game.effects) effect.secondsRemaining -= stepSeconds;
  game.effects = game.effects.filter((effect) => effect.secondsRemaining > 0);

  updateCrates(game.crateSpawner, stepSeconds, game.comets, game.settings.crates, game.random);

  const fightersStillIn = game.fighters.filter((fighter) => fighter.vitals.state !== 'eliminated');
  if (fightersStillIn.length <= 1) game.outcome = { winnerId: fightersStillIn[0]?.id ?? null };
}

const blastFlashSeconds = 0.35;

// Hurts and pushes every character in range (except the shooter), weaker towards the edge, pushing away from the centre.
function applyBlast(game, blast) {
  for (const character of game.characters) {
    if (!character.isAlive() || blast.cannotHitIds.includes(character.id)) continue;
    const strength = blastStrengthAt(blast, character);
    if (strength <= 0) continue;
    const awayFromBlast = normalize(subtract(character.position, blast.position));
    character.takeHit(game, blast.damageAtCentre * strength, scale(awayFromBlast, blast.knockbackSpeedAtCentre * strength));
  }
  game.effects.push({ position: blast.position, radius: blast.blastRadius, colour: blast.flashColour, secondsRemaining: blastFlashSeconds, totalSeconds: blastFlashSeconds });
}
