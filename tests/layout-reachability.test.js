// Checks the real comet layout against the real jump numbers: hopping to a neighbour must not need precise aim, and
// a standing jump from anywhere must never fling the player off the map. Change the layout or jump settings and these
// tell you whether the level still works.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createComets } from '../src/gravity.js';
import { createPlayer, placeOnComet, updatePlayerMovement } from '../src/player.js';
import { distance } from '../src/vector.js';
import { isInsideBounds } from '../src/projectiles.js';
import { copyOfSettings } from './helpers.js';

const settings = await copyOfSettings();
const comets = createComets(settings.cometLayout, settings.physics.cometSurfaceGravity);
const stepSeconds = 1 / settings.physics.stepsPerSecond;
const margin = settings.world.outOfBoundsMarginMetres;
const outerBounds = { minimumX: -margin, minimumY: -margin, maximumX: settings.world.widthMetres + margin, maximumY: settings.world.heightMetres + margin };

// Neighbours: comets whose surfaces are at most this far apart. Every comet must have at least one.
const neighbourGapMetres = 5.6;
// How far off the straight line to a neighbour a jump can start and still be expected to land there.
const aimToleranceDegrees = 15;
const maximumHopSeconds = 3.5;

// Jumps from an angle on a comet and reports where the player ends up.
function simulateStandingJump(fromCometIndex, angle, maximumSeconds) {
  const player = createPlayer('player', settings.player, settings.rules);
  placeOnComet(player, comets, fromCometIndex, angle);
  updatePlayerMovement(player, { runDirection: 0, jumpRequested: true }, stepSeconds, comets, settings.player);
  for (let elapsed = 0; elapsed < maximumSeconds; elapsed += stepSeconds) {
    updatePlayerMovement(player, { runDirection: 0, jumpRequested: false }, stepSeconds, comets, settings.player);
    if (player.movementMode === 'grounded') return { landedOn: player.groundedCometIndex, seconds: elapsed };
    if (!isInsideBounds(player.position, outerBounds)) return { leftTheMap: true };
  }
  return { stillFlying: true };
}

function surfaceGap(firstComet, secondComet) {
  return distance(firstComet.centre, secondComet.centre) - firstComet.radius - secondComet.radius;
}

const neighbourPairs = [];
comets.forEach((fromComet, fromIndex) => comets.forEach((toComet, toIndex) => {
  if (fromIndex !== toIndex && surfaceGap(fromComet, toComet) <= neighbourGapMetres) neighbourPairs.push([fromIndex, toIndex]);
}));

test('every comet has at least one neighbour close enough to hop to', () => {
  comets.forEach((comet, cometIndex) => {
    assert.ok(neighbourPairs.some(([fromIndex]) => fromIndex === cometIndex), `comet ${cometIndex} has no neighbour`);
  });
});

test('a standing jump aimed roughly at a neighbour lands on it, quickly', () => {
  for (const [fromIndex, toIndex] of neighbourPairs) {
    const towardsNeighbour = Math.atan2(comets[toIndex].centre.y - comets[fromIndex].centre.y, comets[toIndex].centre.x - comets[fromIndex].centre.x);
    for (const offsetDegrees of [-aimToleranceDegrees, 0, aimToleranceDegrees]) {
      const outcome = simulateStandingJump(fromIndex, towardsNeighbour + (offsetDegrees * Math.PI) / 180, maximumHopSeconds);
      assert.equal(outcome.landedOn, toIndex, `jump ${fromIndex} -> ${toIndex} offset ${offsetDegrees} degrees: ${JSON.stringify(outcome)}`);
    }
  }
});

test('a standing jump from anywhere on any comet never leaves the map', () => {
  comets.forEach((comet, cometIndex) => {
    for (let degrees = 0; degrees < 360; degrees += 10) {
      const outcome = simulateStandingJump(cometIndex, (degrees * Math.PI) / 180, 30);
      assert.ok(!outcome.leftTheMap, `jump from comet ${cometIndex} at ${degrees} degrees left the map`);
    }
  });
});
