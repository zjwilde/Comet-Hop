// The target-practice drone: floats freely (ignores gravity), flies straight to a random waypoint on screen, then
// picks another. Waypoints are chosen so the drone neither sits inside a comet nor flies through one on the way.
import { add, subtract, scale, length, normalize, distance, distanceFromPointToSegment } from './vector.js';
import { createVitals } from './vitals.js';

export function createDrone(id, droneSettings, rules) {
  return {
    id,
    kind: 'drone',
    bodyRadius: droneSettings.bodyRadius,
    position: { x: 0, y: 0 },
    velocity: { x: 0, y: 0 },
    waypoint: { x: 0, y: 0 },
    knockbackVelocity: { x: 0, y: 0 },
    vitals: createVitals(rules),
  };
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

export function placeDroneAtRandomFreeSpot(drone, comets, world, droneSettings, random) {
  drone.position = randomFreeSpot(comets, world, droneSettings, random);
  drone.velocity = { x: 0, y: 0 };
  drone.knockbackVelocity = { x: 0, y: 0 };
  drone.waypoint = chooseWaypoint(drone.position, comets, world, droneSettings, random);
}

export function updateDrone(drone, stepSeconds, comets, world, droneSettings, random) {
  const toWaypoint = subtract(drone.waypoint, drone.position);
  let steeringVelocity = { x: 0, y: 0 };
  if (length(toWaypoint) <= Math.max(droneSettings.arrivalDistance, droneSettings.cruiseSpeed * stepSeconds)) {
    drone.position = { ...drone.waypoint };
    drone.waypoint = chooseWaypoint(drone.position, comets, world, droneSettings, random);
  } else {
    steeringVelocity = scale(normalize(toWaypoint), droneSettings.cruiseSpeed);
  }

  drone.knockbackVelocity = scale(drone.knockbackVelocity, Math.exp(-droneSettings.knockbackFadePerSecond * stepSeconds));
  drone.velocity = add(steeringVelocity, drone.knockbackVelocity);
  drone.position = add(drone.position, scale(drone.velocity, stepSeconds));

  // Knockback can shove the drone into a comet or off screen: push it back out, and re-plan if its path is now blocked.
  for (const comet of comets) {
    const offsetFromCentre = subtract(drone.position, comet.centre);
    const minimumDistance = comet.radius + drone.bodyRadius;
    if (length(offsetFromCentre) < minimumDistance) {
      drone.position = add(comet.centre, scale(normalize(offsetFromCentre), minimumDistance));
    }
  }
  drone.position.x = Math.min(world.widthMetres - drone.bodyRadius, Math.max(drone.bodyRadius, drone.position.x));
  drone.position.y = Math.min(world.heightMetres - drone.bodyRadius, Math.max(drone.bodyRadius, drone.position.y));
  if (!isPathClear(drone.position, drone.waypoint, comets, droneSettings)) {
    drone.waypoint = chooseWaypoint(drone.position, comets, world, droneSettings, random);
  }
}
