// The bot's controller. It produces exactly the controls a human gives (run direction, jump, aim point, fire), so the bot
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
import { idleControls } from './controllers.js';

export class BotController {
  constructor() {
    this.secondsUntilNextDecision = 0;
    this.plannedRunDirection = 0;
    this.wantsToJump = false;
    // A neighbouring comet it's heading for, or null.
    this.hopTargetCometIndex = null;
    this.secondsUntilAimReplan = 0;
    // { direction, mouseDistance, closestApproach } or null when there's nothing to shoot at.
    this.plannedShot = null;
  }

  decideControls(game, fighter, stepSeconds) {
    const botSettings = game.settings.bot;
    const controls = idleControls(fighter);

    this.secondsUntilNextDecision -= stepSeconds;
    if (this.secondsUntilNextDecision <= 0) {
      this.secondsUntilNextDecision = botSettings.shortestDecisionSeconds
        + game.random() * (botSettings.longestDecisionSeconds - botSettings.shortestDecisionSeconds);
      const standStill = game.random() < botSettings.chanceToStandStillPerDecision;
      this.plannedRunDirection = standStill ? 0 : (game.random() < 0.5 ? -1 : 1);
      this.wantsToJump = game.random() < botSettings.chanceToJumpPerDecision;
      const target = nearestEnemy(game, fighter);
      const hasGoodShot = this.plannedShot && this.plannedShot.closestApproach <= botSettings.fireWhenShotPassesWithinMetres;
      this.hopTargetCometIndex = target && !hasGoodShot && fighter.movementMode === 'grounded'
        && game.random() < botSettings.chanceToHopTowardsTargetPerDecision ? neighbourCometTowards(game, fighter, target) : null;
    }

    if (fighter.movementMode === 'grounded') this.decideGroundMovement(game, fighter, controls);

    const target = nearestEnemy(game, fighter);
    this.secondsUntilAimReplan -= stepSeconds;
    if (this.secondsUntilAimReplan <= 0) {
      this.secondsUntilAimReplan = botSettings.aimReplanSeconds;
      this.plannedShot = target ? planShot(game, fighter, target) : null;
    }
    if (this.plannedShot && target) {
      controls.aimPoint = add(fighter.position, scale(this.plannedShot.direction, this.plannedShot.mouseDistance));
      controls.fireHeld = this.plannedShot.closestApproach <= botSettings.fireWhenShotPassesWithinMetres;
    }
    return controls;
  }

  // Fills in controls.runDirection and controls.jumpRequested: a crate first, then a planned hop, then wandering.
  decideGroundMovement(game, fighter, controls) {
    if (this.hopTargetCometIndex === fighter.groundedCometIndex) this.hopTargetCometIndex = null;
    const towardsCrate = runDirectionTowardsCrateOnSameComet(game, fighter);
    if (towardsCrate !== null) {
      controls.runDirection = towardsCrate;
    } else if (this.hopTargetCometIndex !== null) {
      const here = game.comets[fighter.groundedCometIndex].centre;
      const there = game.comets[this.hopTargetCometIndex].centre;
      const angleGap = signedAngleGap(fighter.angleOnComet, Math.atan2(there.y - here.y, there.x - here.x));
      if (Math.abs(angleGap) < 0.05) {
        // Facing the neighbour: a standing jump from here lands on it.
        controls.jumpRequested = true;
        this.hopTargetCometIndex = null;
      } else {
        controls.runDirection = Math.sign(angleGap);
      }
    } else {
      controls.runDirection = this.plannedRunDirection;
      // Jumps standing still (no running speed carried), since a standing jump never leaves the map.
      if (this.wantsToJump) {
        controls.runDirection = 0;
        controls.jumpRequested = true;
        this.wantsToJump = false;
      }
    }
  }
}

// How far to turn from one angle to another the short way round: positive is clockwise. Between -pi and pi.
function signedAngleGap(fromAngle, toAngle) {
  const fullTurn = 2 * Math.PI;
  const clockwiseGap = (((toAngle - fromAngle) % fullTurn) + fullTurn) % fullTurn;
  return clockwiseGap <= Math.PI ? clockwiseGap : clockwiseGap - fullTurn;
}

// +1 (clockwise) or -1 (counterclockwise), whichever way round is shorter, or null if no crate is on this comet.
function runDirectionTowardsCrateOnSameComet(game, fighter) {
  const crate = game.crateSpawner.crates.find((candidate) => !candidate.floating && candidate.cometIndex === fighter.groundedCometIndex);
  if (!crate) return null;
  return signedAngleGap(fighter.angleOnComet, crate.angleOnComet) >= 0 ? 1 : -1;
}

// The hoppable neighbouring comet that is closest to the target, if it's closer than the comet the fighter is on.
function neighbourCometTowards(game, fighter, target) {
  const here = game.comets[fighter.groundedCometIndex];
  let best = null;
  game.comets.forEach((comet, cometIndex) => {
    const surfaceGap = distance(comet.centre, here.centre) - comet.radius - here.radius;
    if (comet === here || surfaceGap > game.settings.fighter.longestHopGapMetres) return;
    const distanceToTarget = distance(comet.centre, target.position);
    if (distanceToTarget < distance(here.centre, target.position) && (!best || distanceToTarget < best.distanceToTarget)) {
      best = { cometIndex, distanceToTarget };
    }
  });
  return best ? best.cometIndex : null;
}

function nearestEnemy(game, fighter) {
  const enemies = game.fighters.filter((other) => other !== fighter && other.isAlive());
  enemies.sort((first, second) => distance(first.position, fighter.position) - distance(second.position, fighter.position));
  return enemies[0] ?? null;
}

function planShot(game, fighter, target) {
  const botSettings = game.settings.bot;
  // With the Barrage selected, it aims for the most recently collected of the weapons that will fire.
  const firingWeaponNames = weaponsThatFire(fighter.arsenal, game.settings.weapons);
  const weaponDefinition = game.settings.weapons[firingWeaponNames[firingWeaponNames.length - 1]];
  const range = weaponDefinition.muzzleSpeedRange;
  const speedsToTry = range
    ? Array.from({ length: botSettings.muzzleSpeedsToTry }, (_, index) => range.slowest + (index / (botSettings.muzzleSpeedsToTry - 1)) * (range.fastest - range.slowest))
    : [weaponDefinition.projectileSpeed];
  const predictionSeconds = Math.min(botSettings.shotPredictionSeconds, weaponDefinition.projectileLifetimeSeconds);

  let best = null;
  function tryShot(angle, muzzleSpeed) {
    const path = predictFlightPath(fighter, directionFromAngle(angle), muzzleSpeed, weaponDefinition, game.comets, game.outerBounds, predictionSeconds, 1 / 60);
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
    // A tiny minimum keeps the aim point off the fighter itself, so the aim direction is always defined.
    mouseDistance: Math.max(0.01, mouseDistanceForMuzzleSpeed(weaponDefinition, best.muzzleSpeed * speedError, game.settings.aiming)),
    closestApproach: best.closestApproach,
  };
}
