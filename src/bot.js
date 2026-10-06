// The bot's brain. It produces exactly the controls a human gives (run direction, jump, aim point, fire), so the bot
// plays by the same rules as the player. Deliberately simple and a bit sloppy:
// - wanders: every so often picks a new running direction (or stands still), and sometimes does a standing jump;
// - when it has no good shot, often hops towards its target: runs round to face a neighbouring comet that's closer to
//   the target, then does a standing jump (which lands on that neighbour, see tests/layout-reachability.test.js);
// - grabs a crate if one is on the comet it's standing on;
// - aims by trying many directions (and, for weapons with adjustable power, many powers), following each shot's
//   predicted path, and picking the one that passes closest to its target, then adding some random error;
// - fires only if that best shot passes close enough to the target.
import { add, scale, distance, directionFromAngle } from './vector.js';
import { weaponsThatFire } from './weapons.js';
import { predictFlightPath, mouseDistanceForMuzzleSpeed } from './projectiles.js';
import { isAlive } from './vitals.js';

export function createBotBrain() {
  return {
    secondsUntilNextDecision: 0,
    plannedRunDirection: 0,
    wantsToJump: false,
    // A neighbouring comet it's heading for, or null.
    hopTargetCometIndex: null,
    secondsUntilAimReplan: 0,
    // { direction, mouseDistance, closestApproach } or null when there's nothing to shoot at.
    plannedShot: null,
  };
}

export function decideBotControls(game, bot, stepSeconds) {
  const brain = bot.botBrain;
  const botSettings = game.settings.bot;
  const controls = { runDirection: 0, jumpRequested: false, fireHeld: false, aimPoint: { ...bot.position }, switchWeaponRequested: false };
  if (!isAlive(bot.vitals)) return controls;

  brain.secondsUntilNextDecision -= stepSeconds;
  if (brain.secondsUntilNextDecision <= 0) {
    brain.secondsUntilNextDecision = botSettings.shortestDecisionSeconds
      + game.random() * (botSettings.longestDecisionSeconds - botSettings.shortestDecisionSeconds);
    const standStill = game.random() < botSettings.chanceToStandStillPerDecision;
    brain.plannedRunDirection = standStill ? 0 : (game.random() < 0.5 ? -1 : 1);
    brain.wantsToJump = game.random() < botSettings.chanceToJumpPerDecision;
    const target = nearestEnemy(game, bot);
    const hasGoodShot = brain.plannedShot && brain.plannedShot.closestApproach <= botSettings.fireWhenShotPassesWithinMetres;
    brain.hopTargetCometIndex = target && !hasGoodShot && bot.movementMode === 'grounded'
      && game.random() < botSettings.chanceToHopTowardsTargetPerDecision ? neighbourCometTowards(game, bot, target) : null;
  }

  if (bot.movementMode === 'grounded') {
    if (brain.hopTargetCometIndex === bot.groundedCometIndex) brain.hopTargetCometIndex = null;
    const towardsCrate = runDirectionTowardsCrateOnSameComet(game, bot);
    if (towardsCrate !== null) {
      controls.runDirection = towardsCrate;
    } else if (brain.hopTargetCometIndex !== null) {
      const here = game.comets[bot.groundedCometIndex].centre;
      const there = game.comets[brain.hopTargetCometIndex].centre;
      const angleGap = signedAngleGap(bot.angleOnComet, Math.atan2(there.y - here.y, there.x - here.x));
      if (Math.abs(angleGap) < 0.05) {
        // Facing the neighbour: a standing jump from here lands on it.
        controls.jumpRequested = true;
        brain.hopTargetCometIndex = null;
      } else {
        controls.runDirection = Math.sign(angleGap);
      }
    } else {
      controls.runDirection = brain.plannedRunDirection;
      // Jumps standing still (no running speed carried), since a standing jump never leaves the map.
      if (brain.wantsToJump) {
        controls.runDirection = 0;
        controls.jumpRequested = true;
        brain.wantsToJump = false;
      }
    }
  }

  const target = nearestEnemy(game, bot);
  brain.secondsUntilAimReplan -= stepSeconds;
  if (brain.secondsUntilAimReplan <= 0) {
    brain.secondsUntilAimReplan = botSettings.aimReplanSeconds;
    brain.plannedShot = target ? planShot(game, bot, target) : null;
  }
  if (brain.plannedShot && target) {
    controls.aimPoint = add(bot.position, scale(brain.plannedShot.direction, brain.plannedShot.mouseDistance));
    controls.fireHeld = brain.plannedShot.closestApproach <= botSettings.fireWhenShotPassesWithinMetres;
  }
  return controls;
}

// How far to turn from one angle to another the short way round: positive is clockwise. Between -pi and pi.
function signedAngleGap(fromAngle, toAngle) {
  const fullTurn = 2 * Math.PI;
  const clockwiseGap = (((toAngle - fromAngle) % fullTurn) + fullTurn) % fullTurn;
  return clockwiseGap <= Math.PI ? clockwiseGap : clockwiseGap - fullTurn;
}

// +1 (clockwise) or -1 (counterclockwise), whichever way round is shorter, or null if no crate is on this comet.
function runDirectionTowardsCrateOnSameComet(game, bot) {
  const crate = game.crateSpawner.crates.find((candidate) => !candidate.floating && candidate.cometIndex === bot.groundedCometIndex);
  if (!crate) return null;
  return signedAngleGap(bot.angleOnComet, crate.angleOnComet) >= 0 ? 1 : -1;
}

// The hoppable neighbouring comet that is closest to the target, if it's closer than the comet the bot is on.
function neighbourCometTowards(game, bot, target) {
  const here = game.comets[bot.groundedCometIndex];
  let best = null;
  game.comets.forEach((comet, cometIndex) => {
    const surfaceGap = distance(comet.centre, here.centre) - comet.radius - here.radius;
    if (comet === here || surfaceGap > game.settings.bot.longestHopGapMetres) return;
    const distanceToTarget = distance(comet.centre, target.position);
    if (distanceToTarget < distance(here.centre, target.position) && (!best || distanceToTarget < best.distanceToTarget)) {
      best = { cometIndex, distanceToTarget };
    }
  });
  return best ? best.cometIndex : null;
}

function nearestEnemy(game, bot) {
  const enemies = game.fighters.filter((fighter) => fighter !== bot && isAlive(fighter.vitals));
  enemies.sort((first, second) => distance(first.position, bot.position) - distance(second.position, bot.position));
  return enemies[0] ?? null;
}

function planShot(game, bot, target) {
  const botSettings = game.settings.bot;
  // With the Barrage selected, it aims for the most recently collected of the weapons that will fire.
  const firingWeaponNames = weaponsThatFire(bot.arsenal, game.settings.weapons);
  const weaponDefinition = game.settings.weapons[firingWeaponNames[firingWeaponNames.length - 1]];
  const range = weaponDefinition.muzzleSpeedRange;
  const speedsToTry = range
    ? Array.from({ length: botSettings.muzzleSpeedsToTry }, (_, index) => range.slowest + (index / (botSettings.muzzleSpeedsToTry - 1)) * (range.fastest - range.slowest))
    : [weaponDefinition.projectileSpeed];
  const predictionSeconds = Math.min(botSettings.shotPredictionSeconds, weaponDefinition.projectileLifetimeSeconds);

  let best = null;
  function tryShot(angle, muzzleSpeed) {
    const path = predictFlightPath(bot, directionFromAngle(angle), muzzleSpeed, weaponDefinition, game.comets, game.outerBounds, predictionSeconds, 1 / 60);
    const closestApproach = Math.min(...path.map((point) => distance(point, target.position)));
    if (!best || closestApproach < best.closestApproach) best = { angle, muzzleSpeed, closestApproach };
  }
  // A coarse search all the way round, then a finer one around the best direction found.
  const coarseStepRadians = (2 * Math.PI) / botSettings.aimDirectionsToTry;
  for (let directionIndex = 0; directionIndex < botSettings.aimDirectionsToTry; directionIndex += 1) {
    for (const muzzleSpeed of speedsToTry) tryShot(directionIndex * coarseStepRadians, muzzleSpeed);
  }
  const coarseBest = best;
  const fineSteps = 10;
  for (let fineIndex = -fineSteps; fineIndex <= fineSteps; fineIndex += 1) {
    tryShot(coarseBest.angle + (fineIndex / fineSteps) * coarseStepRadians, coarseBest.muzzleSpeed);
  }

  const angleError = ((game.random() * 2 - 1) * botSettings.aimErrorDegrees * Math.PI) / 180;
  const speedError = 1 + (game.random() * 2 - 1) * botSettings.muzzleSpeedErrorFraction;
  return {
    direction: directionFromAngle(best.angle + angleError),
    // A tiny minimum keeps the aim point off the bot itself, so the aim direction is always defined.
    mouseDistance: Math.max(0.01, mouseDistanceForMuzzleSpeed(weaponDefinition, best.muzzleSpeed * speedError, game.settings.aiming)),
    closestApproach: best.closestApproach,
  };
}
