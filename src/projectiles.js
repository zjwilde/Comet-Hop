// Shots in flight: bent by comet gravity (scaled per weapon), stopped by comets (unless they bore through), the world
// edge, or their lifetime. Some burst into fragments where they hit; some detonate on coming out of a comet.
import { add, subtract, scale, distance, length, normalize, directionFromAngle } from './vector.js';
import { gravityAt } from './gravity.js';
import { isAlive } from './vitals.js';

// Fixed-speed weapons ignore the mouse. For the rest, the mouse's distance from the fighter picks a speed in the
// weapon's range: right on the fighter is the slowest, mouseDistanceForFullPower or further is the fastest.
export function muzzleSpeedFor(shotDefinition, mouseDistance, aimingSettings) {
  const range = shotDefinition.muzzleSpeedRange;
  if (!range) return shotDefinition.projectileSpeed;
  const power = Math.min(1, Math.max(0, mouseDistance / aimingSettings.mouseDistanceForFullPower));
  return range.slowest + power * (range.fastest - range.slowest);
}

// The reverse of muzzleSpeedFor: how far from the fighter to aim to get a given speed (the bot aims this way).
export function mouseDistanceForMuzzleSpeed(shotDefinition, muzzleSpeed, aimingSettings) {
  const range = shotDefinition.muzzleSpeedRange;
  if (!range) return aimingSettings.mouseDistanceForFullPower;
  const power = Math.min(1, Math.max(0, (muzzleSpeed - range.slowest) / (range.fastest - range.slowest)));
  return power * aimingSettings.mouseDistanceForFullPower;
}

// Starts just outside the shooter's body, so the shot never begins inside the shooter.
// canHurtShooter: the rules' shotsCanHurtTheirShooter. Even then, the shot can't hit its shooter until it has once
// been clear of the shooter's body, so it doesn't hit them the moment it's fired.
export function createProjectile(shooter, aimDirection, shotDefinition, muzzleSpeed = shotDefinition.projectileSpeed, canHurtShooter = false) {
  return {
    ownerId: shooter.id,
    // Who this shot (and its fragments and blast) can never hit.
    cannotHitIds: canHurtShooter ? [] : [shooter.id],
    hasClearedShooter: false,
    isFragment: false,
    // Whether its speed was chosen by mouse distance (a curving, lobbed weapon).
    adjustablePower: Boolean(shotDefinition.muzzleSpeedRange),
    position: add(shooter.position, scale(aimDirection, shooter.bodyRadius + shotDefinition.projectileRadius)),
    velocity: scale(aimDirection, muzzleSpeed),
    radius: shotDefinition.projectileRadius,
    damage: shotDefinition.damage,
    knockbackSpeed: shotDefinition.knockbackSpeed,
    gravityScale: shotDefinition.gravityScale,
    secondsRemaining: shotDefinition.projectileLifetimeSeconds,
    colour: shotDefinition.projectileColour,
    shape: shotDefinition.projectileShape,
    passesThroughComets: shotDefinition.passesThroughComets,
    eruption: shotDefinition.eruption,
    detonation: shotDefinition.detonation ?? null,
    // For a detonating shot: the comet it has bored into, once it's inside one.
    drilledCometIndex: null,
  };
}

function moveProjectile(projectile, stepSeconds, comets) {
  const gravity = gravityAt(projectile.position, comets);
  projectile.velocity = add(projectile.velocity, scale(gravity, projectile.gravityScale * stepSeconds));
  projectile.position = add(projectile.position, scale(projectile.velocity, stepSeconds));
  projectile.secondsRemaining -= stepSeconds;
}

// The comet a shot has hit, or undefined. Shots that bore through comets never hit one.
function cometHitBy(projectile, comets) {
  if (projectile.passesThroughComets) return undefined;
  return comets.find((comet) => distance(comet.centre, projectile.position) <= comet.radius + projectile.radius);
}

// For a shot that detonates on leaving the first comet it bores into (the drill): notes that comet, and returns the
// blast point (on that comet's surface) on the step it comes back out of the far side. Returns null otherwise.
function detonationPoint(projectile, comets) {
  if (projectile.detonation?.trigger !== 'leavingFirstComet') return null;
  if (projectile.drilledCometIndex === null) {
    const enteredIndex = comets.findIndex((comet) => distance(comet.centre, projectile.position) < comet.radius);
    if (enteredIndex >= 0) projectile.drilledCometIndex = enteredIndex;
    return null;
  }
  const comet = comets[projectile.drilledCometIndex];
  if (distance(comet.centre, projectile.position) < comet.radius) return null;
  return add(comet.centre, scale(normalize(subtract(projectile.position, comet.centre)), comet.radius));
}

// The fragments a bursting shot throws out: an even fan centred on upDirection, with varied speeds.
function eruptionFragments(shell, burstPoint, upDirection, alsoCannotHitId) {
  const eruption = shell.eruption;
  const centreAngle = Math.atan2(upDirection.y, upDirection.x);
  const spreadRadians = (eruption.spreadDegrees * Math.PI) / 180;
  const fragments = [];
  for (let fragmentIndex = 0; fragmentIndex < eruption.fragmentCount; fragmentIndex += 1) {
    const fractionAcrossFan = eruption.fragmentCount === 1 ? 0.5 : fragmentIndex / (eruption.fragmentCount - 1);
    const direction = directionFromAngle(centreAngle + (fractionAcrossFan - 0.5) * spreadRadians);
    // Spread the speeds over the range in a scattered but repeatable order (steps of the golden ratio).
    const speedFraction = (fragmentIndex * 0.618034) % 1;
    const speed = eruption.slowestFragmentSpeed + speedFraction * (eruption.fastestFragmentSpeed - eruption.slowestFragmentSpeed);
    fragments.push({
      ownerId: shell.ownerId,
      cannotHitIds: alsoCannotHitId ? [...shell.cannotHitIds, alsoCannotHitId] : [...shell.cannotHitIds],
      // Fragments start where the shell landed, not at the shooter, so (if allowed) they can hurt the shooter at once.
      hasClearedShooter: true,
      isFragment: true,
      adjustablePower: false,
      position: { ...burstPoint },
      velocity: scale(direction, speed),
      radius: eruption.fragmentRadius,
      damage: eruption.fragmentDamage,
      knockbackSpeed: eruption.fragmentKnockbackSpeed,
      gravityScale: shell.gravityScale,
      secondsRemaining: eruption.fragmentLifetimeSeconds,
      colour: eruption.fragmentColour,
      shape: 'ball',
      passesThroughComets: false,
      eruption: null,
      detonation: null,
      drilledCometIndex: null,
    });
  }
  return fragments;
}

// Moves every projectile one step and removes finished ones (in place), adding any fragments from bursts.
// Returns { hits: [{ projectile, target }], blasts: [{ position, cannotHitIds, ...detonation settings }],
// landings: [{ ownerId, adjustablePower, position }] } where landings are the main shots (not fragments) that ended this
// step by hitting a comet or a character, detonating, leaving the world, or running out of time; anyone watching can see
// where those came down or were last seen.
export function updateProjectiles(projectiles, stepSeconds, comets, characters, worldBounds) {
  const hits = [];
  const blasts = [];
  const landings = [];
  const noteLanding = (projectile, position) => {
    if (!projectile.isFragment) landings.push({ ownerId: projectile.ownerId, adjustablePower: projectile.adjustablePower, position: { ...position } });
  };
  const stillFlying = [];
  const newFragments = [];
  for (const projectile of projectiles) {
    moveProjectile(projectile, stepSeconds, comets);

    // Detonating comes first, so someone standing right where a drill comes out takes the blast, not just a bump.
    const blastPoint = detonationPoint(projectile, comets);
    if (blastPoint) {
      blasts.push({ ...projectile.detonation, position: blastPoint, cannotHitIds: [...projectile.cannotHitIds] });
      noteLanding(projectile, blastPoint);
      continue;
    }
    // A drill still underground (inside the comet it bored into, since it hasn't detonated) can't hit anyone outside.
    const underground = projectile.drilledCometIndex !== null;
    if (!projectile.hasClearedShooter) {
      const shooter = characters.find((character) => character.id === projectile.ownerId);
      projectile.hasClearedShooter = !shooter || distance(shooter.position, projectile.position) > shooter.bodyRadius + projectile.radius;
    }
    const target = !underground && characters.find((character) => !projectile.cannotHitIds.includes(character.id)
      && (character.id !== projectile.ownerId || projectile.hasClearedShooter)
      && isAlive(character.vitals)
      && distance(character.position, projectile.position) <= character.bodyRadius + projectile.radius);
    const detonatesOnImpact = projectile.detonation?.trigger === 'impact';
    if (target && detonatesOnImpact) {
      // Centred where the shell touches the target's body, so a direct hit is a full-strength blast.
      const contactPoint = add(target.position, scale(normalize(subtract(projectile.position, target.position)), target.bodyRadius));
      blasts.push({ ...projectile.detonation, position: contactPoint, cannotHitIds: [...projectile.cannotHitIds] });
      noteLanding(projectile, contactPoint);
      continue;
    }
    if (target) {
      hits.push({ projectile, target });
      noteLanding(projectile, projectile.position);
      // Fragments fly back the way the shell came, and don't hit the target the shell already hit.
      if (projectile.eruption) newFragments.push(...eruptionFragments(projectile, projectile.position, scale(normalize(projectile.velocity), -1), target.id));
      continue;
    }
    const comet = cometHitBy(projectile, comets);
    if (comet) {
      noteLanding(projectile, projectile.position);
      if (detonatesOnImpact) {
        const surfacePoint = add(comet.centre, scale(normalize(subtract(projectile.position, comet.centre)), comet.radius));
        blasts.push({ ...projectile.detonation, position: surfacePoint, cannotHitIds: [...projectile.cannotHitIds] });
      }
      if (projectile.eruption) {
        const upFromSurface = normalize(subtract(projectile.position, comet.centre));
        const burstPoint = add(comet.centre, scale(upFromSurface, comet.radius + projectile.eruption.fragmentRadius + 0.02));
        newFragments.push(...eruptionFragments(projectile, burstPoint, upFromSurface, null));
      }
      continue;
    }
    if (projectile.secondsRemaining <= 0 || !isInsideBounds(projectile.position, worldBounds)) {
      // Shots that fly off or fizzle out count as coming down where they were last seen (an overshoot, say).
      noteLanding(projectile, projectile.position);
      continue;
    }
    stillFlying.push(projectile);
  }
  projectiles.length = 0;
  projectiles.push(...stillFlying, ...newFragments);
  return { hits, blasts, landings };
}

// How hard a blast hits a character: 1 at the centre, falling to 0 at the blast radius (measured to the nearest edge
// of the character's body), and 0 beyond it.
export function blastStrengthAt(blast, character) {
  const distanceToBody = Math.max(0, distance(blast.position, character.position) - character.bodyRadius);
  return Math.max(0, 1 - distanceToBody / blast.blastRadius);
}

// Where a shot would go if fired now, ignoring characters: the list of points it passes through, ending where it would
// hit a comet, detonate, leave the world, run out of lifetime, or after the given number of seconds.
export function predictFlightPath(shooter, aimDirection, muzzleSpeed, shotDefinition, comets, worldBounds, seconds, stepSeconds) {
  const projectile = createProjectile(shooter, aimDirection, shotDefinition, muzzleSpeed);
  const points = [{ ...projectile.position }];
  for (let elapsed = 0; elapsed < seconds && projectile.secondsRemaining > 0; elapsed += stepSeconds) {
    moveProjectile(projectile, stepSeconds, comets);
    const blastPoint = detonationPoint(projectile, comets);
    if (blastPoint) {
      points.push(blastPoint);
      break;
    }
    points.push({ ...projectile.position });
    if (cometHitBy(projectile, comets) || !isInsideBounds(projectile.position, worldBounds)) break;
  }
  return points;
}

export function isInsideBounds(point, worldBounds) {
  return point.x >= worldBounds.minimumX && point.x <= worldBounds.maximumX
    && point.y >= worldBounds.minimumY && point.y <= worldBounds.maximumY;
}

// Direction of travel times the shot's knockback speed.
export function knockbackVelocityOf(projectile) {
  const speed = length(projectile.velocity);
  return speed === 0 ? { x: 0, y: 0 } : scale(projectile.velocity, projectile.knockbackSpeed / speed);
}
