// Drones: characters that float freely (ignoring gravity), flying straight to a random waypoint on screen and then
// picking another. Waypoints are chosen so a drone neither sits inside a comet nor flies through one on the way.
// Drone is the base for every kind of drone; each kind (see hazard-drone.js) adds what it does on top of flying.
import { add, subtract, scale, length, normalize, distance, distanceFromPointToSegment } from './vector.js';
import { Character } from './character.js';

export class Drone extends Character {
  // droneSettings: this kind of drone's settings (size, speed, clearance, and anything its kind adds).
  constructor(id, droneSettings, rules) {
    super(id, droneSettings.bodyRadius, rules);
    this.settings = droneSettings;
    this.waypoint = { x: 0, y: 0 };
    this.knockbackVelocity = { x: 0, y: 0 };
  }

  update(game, stepSeconds) {
    this.fly(stepSeconds, game.comets, game.settings.world, game.random);
  }

  fly(stepSeconds, comets, world, random) {
    const toWaypoint = subtract(this.waypoint, this.position);
    let steeringVelocity = { x: 0, y: 0 };
    if (length(toWaypoint) <= Math.max(this.settings.arrivalDistance, this.settings.cruiseSpeed * stepSeconds)) {
      this.position = { ...this.waypoint };
      this.waypoint = chooseWaypoint(this.position, comets, world, this.settings, random);
    } else {
      steeringVelocity = scale(normalize(toWaypoint), this.settings.cruiseSpeed);
    }

    this.knockbackVelocity = scale(this.knockbackVelocity, Math.exp(-this.settings.knockbackFadePerSecond * stepSeconds));
    this.velocity = add(steeringVelocity, this.knockbackVelocity);
    this.position = add(this.position, scale(this.velocity, stepSeconds));

    // Knockback can shove the drone into a comet or off screen: push it back out, and re-plan if its path is now blocked.
    for (const comet of comets) {
      const offsetFromCentre = subtract(this.position, comet.centre);
      const minimumDistance = comet.radius + this.bodyRadius;
      if (length(offsetFromCentre) < minimumDistance) {
        this.position = add(comet.centre, scale(normalize(offsetFromCentre), minimumDistance));
      }
    }
    this.position.x = Math.min(world.widthMetres - this.bodyRadius, Math.max(this.bodyRadius, this.position.x));
    this.position.y = Math.min(world.heightMetres - this.bodyRadius, Math.max(this.bodyRadius, this.position.y));
    if (!isPathClear(this.position, this.waypoint, comets, this.settings)) {
      this.waypoint = chooseWaypoint(this.position, comets, world, this.settings, random);
    }
  }

  // Knockback adds a push that fades out over time.
  receiveKnockback(knockbackVelocity) {
    this.knockbackVelocity = add(this.knockbackVelocity, knockbackVelocity);
  }

  respawn(game) {
    this.placeAtRandomFreeSpot(game.comets, game.settings.world, game.random);
  }

  placeAtRandomFreeSpot(comets, world, random) {
    this.position = randomFreeSpot(comets, world, this.settings, random);
    this.velocity = { x: 0, y: 0 };
    this.knockbackVelocity = { x: 0, y: 0 };
    this.waypoint = chooseWaypoint(this.position, comets, world, this.settings, random);
  }
}

// A spot is free if the whole drone body, plus the clearance, stays outside every comet.
export function isFreeSpot(point, comets, droneSettings) {
  return comets.every((comet) => distance(point, comet.centre) >= comet.radius + droneSettings.bodyRadius + droneSettings.clearanceFromComets);
}

// The straight path is clear if the drone body never overlaps a comet along it. (Clearance isn't required here, so a
// drone that was knocked right up against a comet can still fly away from it.)
export function isPathClear(fromPoint, toPoint, comets, droneSettings) {
  return comets.every((comet) => distanceFromPointToSegment(comet.centre, fromPoint, toPoint) >= comet.radius + droneSettings.bodyRadius - 1e-9);
}

export function randomFreeSpot(comets, world, droneSettings, random, isAcceptable = () => true) {
  const margin = droneSettings.bodyRadius + droneSettings.clearanceFromComets;
  let fallback = null;
  for (let attempt = 0; attempt < 100; attempt += 1) {
    const candidate = {
      x: margin + random() * (world.widthMetres - 2 * margin),
      y: margin + random() * (world.heightMetres - 2 * margin),
    };
    if (!isFreeSpot(candidate, comets, droneSettings)) continue;
    if (isAcceptable(candidate)) return candidate;
    fallback ??= candidate;
  }
  return fallback;
}

export function chooseWaypoint(fromPoint, comets, world, droneSettings, random) {
  const waypoint = randomFreeSpot(comets, world, droneSettings, random, (candidate) => isPathClear(fromPoint, candidate, comets, droneSettings));
  return waypoint ?? { ...fromPoint };
}
