// Shots in flight: bent by comet gravity (scaled per weapon), stopped by comets, the world edge, or their lifetime.
import { add, scale, distance, length } from './vector.js';
import { gravityAt } from './gravity.js';
import { isAlive } from './vitals.js';

// Starts just outside the shooter's body, so the shot never begins inside the shooter.
export function createProjectile(owner, aimDirection, weaponDefinition) {
  const spawnDistance = owner.bodyRadius + weaponDefinition.projectileRadius;
  return {
    ownerId: owner.id,
    position: add(owner.position, scale(aimDirection, spawnDistance)),
    velocity: scale(aimDirection, weaponDefinition.projectileSpeed),
    radius: weaponDefinition.projectileRadius,
    damage: weaponDefinition.damage,
    knockbackSpeed: weaponDefinition.knockbackSpeed,
    gravityScale: weaponDefinition.gravityScale,
    secondsRemaining: weaponDefinition.projectileLifetimeSeconds,
    colour: weaponDefinition.projectileColour,
  };
}

// Moves every projectile one step and removes finished ones (in place). Returns the hits as [{ projectile, target }].
// A projectile never hits the character who fired it.
export function updateProjectiles(projectiles, stepSeconds, comets, characters, worldBounds) {
  const hits = [];
  const survivors = [];
  for (const projectile of projectiles) {
    const gravity = gravityAt(projectile.position, comets);
    projectile.velocity = add(projectile.velocity, scale(gravity, projectile.gravityScale * stepSeconds));
    projectile.position = add(projectile.position, scale(projectile.velocity, stepSeconds));
    projectile.secondsRemaining -= stepSeconds;

    const target = characters.find((character) => character.id !== projectile.ownerId
      && isAlive(character.vitals)
      && distance(character.position, projectile.position) <= character.bodyRadius + projectile.radius);
    if (target) {
      hits.push({ projectile, target });
      continue;
    }
    const hitComet = comets.some((comet) => distance(comet.centre, projectile.position) <= comet.radius + projectile.radius);
    if (hitComet || projectile.secondsRemaining <= 0 || !isInsideBounds(projectile.position, worldBounds)) continue;
    survivors.push(projectile);
  }
  projectiles.length = 0;
  projectiles.push(...survivors);
  return hits;
}

export function isInsideBounds(point, worldBounds) {
  return point.x >= worldBounds.minimumX && point.x <= worldBounds.maximumX
    && point.y >= worldBounds.minimumY && point.y <= worldBounds.maximumY;
}

// Direction of travel times the weapon's knockback speed.
export function knockbackVelocityOf(projectile) {
  const speed = length(projectile.velocity);
  return speed === 0 ? { x: 0, y: 0 } : scale(projectile.velocity, projectile.knockbackSpeed / speed);
}
