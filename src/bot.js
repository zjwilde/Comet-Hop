// The bot's controller. It produces exactly the controls a human gives (run direction, jump, aim point, fire), so the
// bot plays by the same rules as the player. It's meant to play like a person: it uses only what a person can see and
// simple rules of thumb, and never calculates where a shot will go.
// - Moving: runs from bursting or exploding shots (anyone's) coming down near it; grabs crates on its own comet; when
//   it can't shoot its target from where it is, goes after it (runs round towards it on the same comet, or hops to the
//   neighbouring comet closest to it); otherwise wanders (runs, stands, sometimes jumps).
// - Choosing a weapon: its hardest-hitting one that can reach the target, but never a bursting or exploding one at a
//   target close by. Its feel for reach is a rough rule, not a calculation; it won't fire at targets out of reach.
//   It saves limited ammo for good moments (see isGoodMomentToSpend), poking with the Blaster otherwise.
// - Straight-flying weapons: points at where it saw the target a moment ago (its reaction time), with some wobble, and
//   fires when the target is in range with no comet in the way.
// - Curving weapons (only fired from solid ground): makes a rough first guess (towards the target, tipped up away from its own comet, power by
//   distance), then learns from each miss, nudging its aim by part of how far off the last shot came down. Like an
//   artillery player, it watches each lob come down before firing the next, and after an explosive one it steps back
//   from where it's headed rather than wandering into the blast.
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
    // How far its last lob at the current target came down from it.
    this.lastLobMissMetres = Infinity;
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

    // It goes after a target only when it couldn't shoot it from here at all; not while merely waiting for its weapon
    // or watching a lob land (which would carry it under its own falling shell).
    const chasing = target && !(shot && shot.inPosition) ? target : null;
    if (fighter.movementMode === 'grounded') this.decideGroundMovement(game, fighter, controls, chasing);

    if (target) {
      const goodMoment = (weaponName, punch) => this.isGoodMomentToSpend(game, fighter, target, weaponName, punch);
      controls.switchWeaponRequested = selectedWeapon(fighter.arsenal).weaponName !== preferredWeapon(game, fighter, target, goodMoment);
      controls.aimPoint = shot.aimPoint;
      // Not while switching: the aim was worked out for the weapon in hand.
      controls.fireHeld = shot.worthFiring && !controls.switchWeaponRequested;
      this.lobBeingAimed = shot.isLob && shot.worthFiring
        ? { firedFrom: { ...fighter.position }, targetId: target.id, targetPositionThen: { ...target.position }, explosive: shot.explosive, blastRadius: shot.blastRadius }
        : null;
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
    this.lastLobMissMetres = distance(landing.position, target.position);
  }

  // Records where the target is now, and returns where it was reactionSeconds ago.
  rememberAndRecall(target, botSettings) {
    this.targetSightings.push({ seconds: this.elapsedSeconds, targetId: target.id, position: { ...target.position } });
    const oldestWorthKeeping = this.elapsedSeconds - Math.max(botSettings.reactionSeconds, botSettings.sittingDuckSeconds) - 0.5;
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
      const worthFiring = isWithinReach(game, weaponDefinition, targetDistance) && hasClearLineOfSight(game, fighter.position, seenTargetPosition)
        && isSafeAtThisRange(game, fighter, targetDistance);
      return { aimPoint: add(fighter.position, scale(direction, aiming.mouseDistanceForFullPower)), worthFiring, inPosition: worthFiring, isLob: false };
    }

    // A lob: start from a rough guess, adjusted by what earlier misses taught it about this target.
    this.forgetLobCorrectionsIfThingsMoved(fighter, target, botSettings);
    const roughDirection = normalize(add(normalize(towardsTarget), scale(up, botSettings.lobLift)));
    const direction = directionFromAngle(Math.atan2(roughDirection.y, roughDirection.x) + this.lobCorrection.turnRadians + this.wobble.turnRadians);
    const power = clamp(roughLobPower(game, weaponDefinition, targetDistance) * this.lobCorrection.powerFactor * this.wobble.powerFactor, 0.02, 1);
    // Never lob (or shoot anything that stops at comets) into the ground at its own feet; a drill may go through it.
    const intoOwnComet = !weaponDefinition.passesThroughComets && dot(direction, up) < 0.15;
    // In position: it could lob at the target from here. Worth firing: in position, on solid ground (mid-hop it would
    // aim straight at the target and drop the shell on the comet it's about to land on), and not still watching its
    // last lob come down.
    const inPosition = !intoOwnComet && isWithinReach(game, weaponDefinition, targetDistance) && isSafeAtThisRange(game, fighter, targetDistance);
    const worthFiring = inPosition && fighter.movementMode === 'grounded' && !this.lobInFlight;
    const explosive = firingNames.some((weaponName) => isBurstingOrExploding(weapons[weaponName]));
    const blastRadius = Math.max(0, ...firingNames.map((weaponName) => weapons[weaponName].detonation?.blastRadius ?? 0));
    return { aimPoint: add(fighter.position, scale(direction, power * aiming.mouseDistanceForFullPower)), worthFiring, inPosition, isLob: true, explosive, blastRadius };
  }

  // Whether now is a good moment to spend a limited-ammo shot of this weapon (punch: how hard it hits) on the target.
  isGoodMomentToSpend(game, fighter, target, weaponName, punch) {
    const { weapons, bot: botSettings } = game.settings;
    const definition = weapons[weaponName];
    const targetDistance = distance(fighter.position, target.position);
    const sightingsLongEnough = this.targetSightings.filter((sighting) => sighting.seconds >= this.elapsedSeconds - botSettings.sittingDuckSeconds);
    const sittingDuck = this.targetSightings.length > 0 && this.targetSightings[0].seconds <= this.elapsedSeconds - botSettings.sittingDuckSeconds
      && sightingsLongEnough.every((sighting) => distance(sighting.position, target.position) < 0.5);
    const zeroedIn = Boolean(definition.muzzleSpeedRange || definition.firesAllCarriedWeapons) && this.lessonsCameFrom
      && this.lessonsCameFrom.targetId === target.id && this.lastLobMissMetres < botSettings.zeroedInMetres;
    const easyStraightShot = !definition.muzzleSpeedRange && !definition.firesAllCarriedWeapons
      && targetDistance <= roughReachOf(game, definition) * botSettings.easyStraightShotReachFraction
      && hasClearLineOfSight(game, fighter.position, target.position);
    return target.movementMode === 'airborne'
      || target.vitals.health <= punch
      || fighter.vitals.health <= fighter.rules.maxHealth * botSettings.desperateHealthFraction
      || sittingDuck
      || zeroedIn
      || easyStraightShot;
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
      this.lastLobMissMetres = Infinity;
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
    } else if (this.lobInFlight && this.lobInFlight.explosive
      && distance(fighter.position, this.lobInFlight.targetPositionThen) < game.settings.bot.dangerZoneMetres + this.lobInFlight.blastRadius) {
      // Steps back from where its own explosive lob is headed, just far enough to be clear, and stays on the ground.
      const centre = game.comets[fighter.groundedCometIndex].centre;
      const headedFor = this.lobInFlight.targetPositionThen;
      controls.runDirection = signedAngleGap(Math.atan2(headedFor.y - centre.y, headedFor.x - centre.x), fighter.angleOnComet) >= 0 ? 1 : -1;
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

// Its feel for how far a weapon carries. Straight-flying weapons: nearly as far as the shot flies in its lifetime.
// Lob weapons: the textbook rough rule for a thrown object, speed squared divided by gravity, at full power.
function roughReachOf(game, weaponDefinition) {
  if (!weaponDefinition.muzzleSpeedRange) return weaponDefinition.projectileSpeed * weaponDefinition.projectileLifetimeSeconds * 0.9;
  return weaponDefinition.muzzleSpeedRange.fastest ** 2 / game.settings.physics.cometSurfaceGravity;
}

function isWithinReach(game, weaponDefinition, targetDistance) {
  const allowance = weaponDefinition.muzzleSpeedRange ? game.settings.bot.lobReachAllowance : 1;
  return targetDistance <= roughReachOf(game, weaponDefinition) * allowance;
}

// The power for a first-guess lob at this distance, by the same rough rule: the speed whose speed squared divided by
// gravity is the distance.
function roughLobPower(game, weaponDefinition, targetDistance) {
  const { slowest, fastest } = weaponDefinition.muzzleSpeedRange;
  const speedNeeded = Math.sqrt(targetDistance * game.settings.physics.cometSurfaceGravity);
  return clamp((speedNeeded - slowest) / (fastest - slowest), 0.15, 1);
}

function isBurstingOrExploding(weaponDefinition) {
  return Boolean(weaponDefinition.eruption || weaponDefinition.detonation);
}

// Rule of thumb: a bursting or exploding weapon is too dangerous at a target closer than pointBlankMetres, or (for a
// big blast) closer than its blast radius plus a step back. Only matters when shots can hurt their shooter.
function isTooCloseFor(game, weaponDefinition, targetDistance) {
  if (!game.settings.rules.shotsCanHurtTheirShooter || !isBurstingOrExploding(weaponDefinition)) return false;
  const blastRadius = weaponDefinition.detonation ? weaponDefinition.detonation.blastRadius : 0;
  return targetDistance < Math.max(game.settings.bot.pointBlankMetres, blastRadius + 1.5);
}

function isSafeAtThisRange(game, fighter, targetDistance) {
  const { weapons } = game.settings;
  return !weaponsThatFire(fighter.arsenal, weapons).some((weaponName) => isTooCloseFor(game, weapons[weaponName], targetDistance));
}

// Its hardest-hitting carried weapon, leaving out bursting or exploding ones when the target is too close for them,
// and limited-ammo ones unless goodMoment(weaponName, punch) says this is a moment worth spending them.
function preferredWeapon(game, fighter, target, goodMoment) {
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
  const targetDistance = distance(fighter.position, target.position);
  const tooClose = (weaponName) => (weapons[weaponName].firesAllCarriedWeapons
    ? carriedNames.some((name) => !weapons[name].firesAllCarriedWeapons && isTooCloseFor(game, weapons[name], targetDistance))
    : isTooCloseFor(game, weapons[weaponName], targetDistance));
  const safeChoices = carriedNames.filter((weaponName) => !tooClose(weaponName));
  // Prefer what can reach; if nothing can, keep the hardest-hitting safe one ready while it closes in.
  const canReach = (weaponName) => {
    const aimedWith = weapons[weaponName].firesAllCarriedWeapons ? weapons[carriedNames.filter((name) => !weapons[name].firesAllCarriedWeapons).at(-1)] : weapons[weaponName];
    return isWithinReach(game, aimedWith, targetDistance);
  };
  const ammoIsUnlimited = (weaponName) => fighter.arsenal.carriedWeapons.find((carried) => carried.weaponName === weaponName).ammoRemaining === null;
  const affordable = safeChoices.filter((weaponName) => ammoIsUnlimited(weaponName) || goodMoment(weaponName, punchOf(weaponName)));
  const reachingChoices = affordable.filter(canReach);
  const choices = reachingChoices.length > 0 ? reachingChoices : affordable;
  return choices.reduce((best, weaponName) => (punchOf(weaponName) > punchOf(best) ? weaponName : best), choices[0]);
}

function hasClearLineOfSight(game, fromPoint, toPoint) {
  return game.comets.every((comet) => distanceFromPointToSegment(comet.centre, fromPoint, toPoint) > comet.radius);
}

// +1 or -1 to run away from a bursting or exploding shot (anyone's) that is close and still heading this way, or null.
// A shot with a bigger blast counts as close from further away.
function runDirectionAwayFromDanger(game, fighter) {
  const threat = game.projectiles.find((projectile) => (projectile.eruption || projectile.isFragment || projectile.detonation)
    && distance(projectile.position, fighter.position) < game.settings.bot.dangerZoneMetres + (projectile.detonation ? projectile.detonation.blastRadius : 0)
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
