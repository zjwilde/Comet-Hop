import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createComets } from '../src/gravity.js';
import { createDrone, placeDroneAtRandomFreeSpot, updateDrone, isFreeSpot, isPathClear } from '../src/drone.js';
import { distance } from '../src/vector.js';
import { copyOfSettings, createSeededRandom } from './helpers.js';

const settings = await copyOfSettings();
const comets = createComets(settings.cometLayout, settings.physics.cometSurfaceGravity);
const stepSeconds = 1 / settings.physics.stepsPerSecond;

function droneOverlapsAComet(drone) {
  return comets.some((comet) => distance(drone.position, comet.centre) < comet.radius + drone.bodyRadius - 1e-9);
}

test('the drone reaches its waypoint, then heads for a new one', () => {
  const random = createSeededRandom(1);
  const drone = createDrone('drone', settings.drone, settings.rules);
  placeDroneAtRandomFreeSpot(drone, comets, settings.world, settings.drone, random);
  const firstWaypoint = { ...drone.waypoint };
  const secondsNeeded = distance(drone.position, firstWaypoint) / settings.drone.cruiseSpeed + 0.1;
  for (let elapsed = 0; elapsed < secondsNeeded; elapsed += stepSeconds) {
    updateDrone(drone, stepSeconds, comets, settings.world, settings.drone, random);
  }
  assert.notDeepEqual(drone.waypoint, firstWaypoint);
});

test('waypoints are always clear of comets, and the straight path to each one never crosses a comet', () => {
  const random = createSeededRandom(2);
  const drone = createDrone('drone', settings.drone, settings.rules);
  placeDroneAtRandomFreeSpot(drone, comets, settings.world, settings.drone, random);
  let waypointsChecked = 0;
  let previousWaypoint = null;
  for (let elapsed = 0; elapsed < 120; elapsed += stepSeconds) {
    if (drone.waypoint !== previousWaypoint) {
      assert.ok(isFreeSpot(drone.waypoint, comets, settings.drone));
      assert.ok(isPathClear(drone.position, drone.waypoint, comets, settings.drone));
      previousWaypoint = drone.waypoint;
      waypointsChecked += 1;
    }
    updateDrone(drone, stepSeconds, comets, settings.world, settings.drone, random);
    assert.ok(!droneOverlapsAComet(drone), 'drone flew into a comet');
  }
  assert.ok(waypointsChecked > 10);
});

test('knockback pushes the drone, but never into a comet or off the screen', () => {
  const random = createSeededRandom(3);
  const drone = createDrone('drone', settings.drone, settings.rules);
  const comet = comets[0];
  drone.position = { x: comet.centre.x + comet.radius + drone.bodyRadius + 0.1, y: comet.centre.y };
  drone.waypoint = { ...drone.position };
  drone.knockbackVelocity = { x: -40, y: 0 };
  for (let step = 0; step < 60; step += 1) {
    updateDrone(drone, stepSeconds, comets, settings.world, settings.drone, random);
    assert.ok(!droneOverlapsAComet(drone));
  }
  drone.knockbackVelocity = { x: 0, y: -400 };
  for (let step = 0; step < 60; step += 1) updateDrone(drone, stepSeconds, comets, settings.world, settings.drone, random);
  assert.ok(drone.position.y >= drone.bodyRadius);
});
