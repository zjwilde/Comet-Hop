// The bot's controller. It produces exactly the controls a human gives (run direction, jump, aim point, fire), so the
// bot plays by the same rules as the player. It's meant to play like a person: it uses only what a person can see and
// simple rules of thumb, and never calculates where a shot will go.
// - Moving: runs from bursting or exploding shots (anyone's) coming down near it; grabs crates on its own comet; when
//   it can't shoot its target from where it is, goes after it (runs round towards it on the same comet, or hops to the
//   neighbouring comet closest to it); otherwise wanders (runs, stands, sometimes jumps).
// - Choosing a weapon: its hardest-hitting one, but never a bursting or exploding one at a target close by.
// - Straight-flying weapons: points at where it saw the target a moment ago (its reaction time), with some wobble, and
//   fires when the target is in range with no comet in the way.
// - Curving weapons: makes a rough first guess (towards the target, tipped up away from its own comet, power by
//   distance), then learns from each miss, nudging its aim by part of how far off the last shot came down. Like an
//   artillery player, it watches each lob come down before firing the next.
import { add, scale, subtract, distance, length, normalize, dot, directionFromAngle, distanceFromPointToSegment } from './vector.js';
import { selectedWeapon, weaponsThatFire } from './weapons.js';
import { idleControls } from './controllers.js';

export class BotController {
  constructor() {
    this.secondsUntilNextDecision = 0;
    this.plannedRunDirection = 0;
    this.wantsToJump = false;
    // A neighbouring comet it's heading for, or null.
    this.hopTargetCometIndex = null;
    this.elapsedSeconds = 0;
    // Where it has recently seen its target, oldest first: [{ seconds, targetId, position }]. For its reaction time.
    this.targetSightings = [];
    // This shot's random error; re-rolled after every shot so the aim doesn't jitter between frames.
    this.wobble = { turnRadians: 0, powerFactor: 1 };
    // What it has learned about lobbing at the current target: a turn added to its first guess, and a power multiplier.
    this.lobCorrection = { turnRadians: 0, powerFactor: 1 };
    // Each lob is described by { firedFrom, targetId, targetPositionThen }: the one it is about to fire (if the weapon is
    // ready), the one in the air it's waiting to see land, and the one its current lessons came from.
    this.lobBeingAimed = null;
    this.lobInFlight = null;
    this.lessonsCameFrom = null;
    this.cooldownLastStep = 0;
  }

  decideControls(game, fighter, stepSeconds) {
    const botSettings = game.settings.bot;
    const controls = idleControls(fighter);
    this.elapsedSeconds += stepSeconds;
    this.noticeOwnShotFired(game, fighter);
    this.learnFromLanding(game, fighter);

    const target = nearestEnemy(game, fighter);
    const seenTargetPosition = target ? this.rememberAndRecall(target, botSettings) : null;
    const shot = target ? this.aimAt(game, fighter, target, seenTargetPosition) : null;

    this.secondsUntilNextDecision -= stepSeconds;
    if (this.secondsUntilNextDecision <= 0) {
      this.secondsUntilNextDecision = botSettings.shortestDecisionSeconds
        + game.random() * (botSettings.longestDecisionSeconds - botSettings.shortestDecisionSeconds);
      const standStill = game.random() < botSettings.chanceToStandStillPerDecision;
      this.plannedRunDirection = standStill ? 0 : (game.random() < 0.5 ? -1 : 1);
      this.wantsToJump = game.random() < botSettings.chanceToJumpPerDecision;
    }

    const chasing = target && !(shot && shot.worthFiring) ? target : null;
    if (fighter.movementMode === 'grounded') this.decideGroundMovement(game, fighter, controls, chasing);

    if (target) {
      controls.switchWeaponRequested = selectedWeapon(fighter.arsenal).weaponName !== preferredWeapon(game, fighter, target);
      controls.aimPoint = shot.aimPoint;
      // Not while switching: the aim was worked out for the weapon in hand.
      controls.fireHeld = shot.worthFiring && !controls.switchWeaponRequested;
      this.lobBeingAimed = shot.isLob && shot.worthFiring ? { firedFrom: { ...fighter.position }, targetId: target.id, targetPositionThen: { ...target.position } } : null;
    }
    return controls;
  }

  // A shot has gone off if the weapon's cooldown jumped up since last step. Then the wobble is re-rolled, and a lob
  // starts being watched to see where it lands.
  noticeOwnShotFired(game, fighter) {
    const cooldown = fighter.arsenal.cooldownSecondsRemaining;
    const justFired = cooldown > this.cooldownLastStep;
    this.cooldownLastStep = cooldown;
    if (!justFired) return;
    const botSettings = game.settings.bot;
    this.wobble = {
      turnRadians: ((game.random() * 2 - 1) * botSettings.aimWobbleDegrees * Math.PI) / 180,
      powerFactor: 1 + (game.random() * 2 - 1) * botSettings.powerWobbleFraction,
    };
    if (this.lobBeingAimed) {
      this.lobInFlight = { ...this.lobBeingAimed, firedAtSeconds: this.elapsedSeconds };
      this.lessonsCameFrom = this.lobBeingAimed;
    }
  }

  // When its watched lob comes down, compares where it landed with where the target is now (what a person would see)
  // and corrects part of the miss: turning towards the target, and adding or removing power for distance.
  learnFromLanding(game, fighter) {
    if (!this.lobInFlight) return;
    // Gives up watching a lob it somehow never saw come down.
    if (this.elapsedSeconds - this.lobInFlight.firedAtSeconds > game.settings.bot.longestLobWatchSeconds) this.lobInFlight = null;
    if (!this.lobInFlight) return;
    const landing = game.latestLandings.find((candidate) => candidate.ownerId === fighter.id && candidate.adjustablePower);
    if (!landing) return;
    const lob = this.lobInFlight;
    this.lobInFlight = null;
    const target = game.fighters.find((other) => other.id === lob.targetId);
    if (!target || !target.isAlive()) return;
    const { correctionFraction } = game.settings.bot;
    const towardsLanding = subtract(landing.position, lob.firedFrom);
    const towardsTarget = subtract(target.position, lob.firedFrom);
    const turnMiss = signedAngleGap(Math.atan2(towardsLanding.y, towardsLanding.x), Math.atan2(towardsTarget.y, towardsTarget.x));
    this.lobCorrection.turnRadians = clamp(this.lobCorrection.turnRadians + correctionFraction * turnMiss, -1, 1);
    const distanceRatio = length(towardsTarget) / Math.max(0.5, length(towardsLanding));
    this.lobCorrection.powerFactor = clamp(this.lobCorrection.powerFactor * (1 + correctionFraction * (distanceRatio - 1)), 0.3, 3);
  }

  // Records where the target is now, and returns where it was reactionSeconds ago.
  rememberAndRecall(target, botSettings) {
    this.targetSightings.push({ seconds: this.elapsedSeconds, targetId: target.id, position: { ...target.position } });
    const oldestWorthKeeping = this.elapsedSeconds - botSettings.reactionSeconds - 0.5;
    this.targetSightings = this.targetSightings.filter((sighting) => sighting.seconds >= oldestWorthKeeping && sighting.targetId === target.id);
    const recalled = this.targetSightings.filter((sighting) => sighting.seconds <= this.elapsedSeconds - botSettings.reactionSeconds).at(-1);
    return (recalled ?? this.targetSightings[0]).position;
  }

  // Works out the aim point and whether a shot is worth taking now, using only rules of thumb.
  aimAt(game, fighter, target, seenTargetPosition) {
    const { weapons, aiming, bot: botSettings } = game.settings;
    const firingNames = weaponsThatFire(fighter.arsenal, weapons);
    // With the Barrage selected, it aims for the most recently collected of the weapons that will fire.
    const weaponDefinition = weapons[firingNames[firingNames.length - 1]];
    const towardsTarget = subtract(seenTargetPosition, fighter.position);
    const targetDistance = length(towardsTarget);
    const up = upDirection(game, fighter, towardsTarget);

    if (!weaponDefinition.muzzleSpeedRange) {
      const direction = directionFromAngle(Math.atan2(towardsTarget.y, towardsTarget.x) + this.wobble.turnRadians);
      const range = weaponDefinition.projectileSpeed * weaponDefinition.projectileLifetimeSeconds * 0.9;
      const worthFiring = targetDistance <= range && hasClearLineOfSight(game, fighter.position, seenTargetPosition)
        && isSafeAtThisRange(game, fighter, targetDistance);
      return { aimPoint: add(fighter.position, scale(direction, aiming.mouseDistanceForFullPower)), worthFiring, isLob: false };
    }

    // A lob: start from a rough guess, adjusted by what earlier misses taught it about this target.
    this.forgetLobCorrectionsIfThingsMoved(fighter, target, botSettings);
    const roughDirection = normalize(add(normalize(towardsTarget), scale(up, botSettings.lobLift)));
    const direction = directionFromAngle(Math.atan2(roughDirection.y, roughDirection.x) + this.lobCorrection.turnRadians + this.wobble.turnRadians);
    const roughPower = clamp(targetDistance / botSettings.metresPerFullPowerGuess, 0.15, 1);
    const power = clamp(roughPower * this.lobCorrection.powerFactor * this.wobble.powerFactor, 0.02, 1);
    // Never lob (or shoot anything that stops at comets) into the ground at its own feet; a drill may go through it.
    const intoOwnComet = !weaponDefinition.passesThroughComets && dot(direction, up) < 0.15;
    const worthFiring = !intoOwnComet && !this.lobInFlight && isSafeAtThisRange(game, fighter, targetDistance);
    return { aimPoint: add(fighter.position, scale(direction, power * aiming.mouseDistanceForFullPower)), worthFiring, isLob: true };
  }

  // Lessons from earlier lobs only apply if neither it nor the target has moved much since; otherwise it guesses afresh.
  forgetLobCorrectionsIfThingsMoved(fighter, target, botSettings) {
    const lessons = this.lessonsCameFrom;
    if (!lessons) return;
    const moved = lessons.targetId !== target.id
      || distance(lessons.firedFrom, fighter.position) > botSettings.forgetCorrectionsAfterMovingMetres
      || distance(lessons.targetPositionThen, target.position) > botSettings.forgetCorrectionsAfterMovingMetres;
    if (moved) {
      this.lobCorrection = { turnRadians: 0, powerFactor: 1 };
      this.lessonsCameFrom = null;
    }
  }

  // Fills in controls.runDirection and controls.jumpRequested, in order of priority: dodging, a crate on this comet,
  // going after a target it can't shoot from here (chasing, or null), then wandering.
  decideGroundMovement(game, fighter, controls, chasing) {
    if (this.hopTargetCometIndex === fighter.groundedCometIndex || !chasing) this.hopTargetCometIndex = null;
    if (chasing && this.hopTargetCometIndex === null) this.hopTargetCometIndex = neighbourCometTowards(game, fighter, chasing);
    const awayFromDanger = runDirectionAwayFromDanger(game, fighter);
    const towardsCrate = runDirectionTowardsCrateOnSameComet(game, fighter);
    const chasingOnThisComet = chasing && chasing.movementMode === 'grounded' && chasing.groundedCometIndex === fighter.groundedCometIndex;
    if (awayFromDanger !== null) {
      controls.runDirection = awayFromDanger;
    } else if (towardsCrate !== null) {
      controls.runDirection = towardsCrate;
    } else if (chasingOnThisComet) {
      controls.runDirection = signedAngleGap(fighter.angleOnComet, chasing.angleOnComet) >= 0 ? 1 : -1;
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

function clamp(value, minimum, maximum) {
  return Math.min(maximum, Math.max(minimum, value));
}

// How far to turn from one angle to another the short way round: positive is clockwise. Between -pi and pi.
function signedAngleGap(fromAngle, toAngle) {
  const fullTurn = 2 * Math.PI;
  const clockwiseGap = (((toAngle - fromAngle) % fullTurn) + fullTurn) % fullTurn;
  return clockwiseGap <= Math.PI ? clockwiseGap : clockwiseGap - fullTurn;
}

// Away from the comet it stands on; in the air, simply towards the target (no tipping up).
function upDirection(game, fighter, towardsTarget) {
  if (fighter.movementMode !== 'grounded') return normalize(towardsTarget);
  return normalize(subtract(fighter.position, game.comets[fighter.groundedCometIndex].centre));
}

function isBurstingOrExploding(weaponDefinition) {
  return Boolean(weaponDefinition.eruption || weaponDefinition.detonation);
}

// Rule of thumb: nothing that bursts or explodes at a target this close, if it could catch the shooter too.
function isSafeAtThisRange(game, fighter, targetDistance) {
  if (!game.settings.rules.shotsCanHurtTheirShooter || targetDistance >= game.settings.bot.pointBlankMetres) return true;
  const { weapons } = game.settings;
  return !weaponsThatFire(fighter.arsenal, weapons).some((weaponName) => isBurstingOrExploding(weapons[weaponName]));
}

// Its hardest-hitting carried weapon, leaving out bursting or exploding ones when the target is close.
function preferredWeapon(game, fighter, target) {
  const { weapons } = game.settings;
  const carriedNames = fighter.arsenal.carriedWeapons.map((carried) => carried.weaponName);
  const punchOf = (weaponName) => {
    const definition = weapons[weaponName];
    if (definition.firesAllCarriedWeapons) {
      return carriedNames.filter((name) => !weapons[name].firesAllCarriedWeapons).reduce((total, name) => total + punchOf(name), 0);
    }
    const burstDamage = definition.eruption ? definition.eruption.fragmentCount * definition.eruption.fragmentDamage * 0.3 : 0;
    return definition.damage + burstDamage + (definition.detonation ? definition.detonation.damageAtCentre : 0);
  };
  const explodes = (weaponName) => (weapons[weaponName].firesAllCarriedWeapons
    ? carriedNames.some((name) => !weapons[name].firesAllCarriedWeapons && isBurstingOrExploding(weapons[name]))
    : isBurstingOrExploding(weapons[weaponName]));
  const close = game.settings.rules.shotsCanHurtTheirShooter && distance(fighter.position, target.position) < game.settings.bot.pointBlankMetres;
  const choices = carriedNames.filter((weaponName) => !(close && explodes(weaponName)));
  return choices.reduce((best, weaponName) => (punchOf(weaponName) > punchOf(best) ? weaponName : best), choices[0]);
}

function hasClearLineOfSight(game, fromPoint, toPoint) {
  return game.comets.every((comet) => distanceFromPointToSegment(comet.centre, fromPoint, toPoint) > comet.radius);
}

// +1 or -1 to run away from a bursting or exploding shot (anyone's) that is close and still heading this way, or null.
function runDirectionAwayFromDanger(game, fighter) {
  const threat = game.projectiles.find((projectile) => (projectile.eruption || projectile.isFragment || projectile.detonation)
    && distance(projectile.position, fighter.position) < game.settings.bot.dangerZoneMetres
    && dot(projectile.velocity, subtract(fighter.position, projectile.position)) > 0);
  if (!threat) return null;
  const centre = game.comets[fighter.groundedCometIndex].centre;
  const threatAngle = Math.atan2(threat.position.y - centre.y, threat.position.x - centre.x);
  return signedAngleGap(threatAngle, fighter.angleOnComet) >= 0 ? 1 : -1;
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
    if (comet === here || surfaceGap > game.settings.bot.longestHopGapMetres) return;
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
