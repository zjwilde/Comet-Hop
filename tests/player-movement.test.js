import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createComets } from '../src/gravity.js';
import { createPlayer, placeOnComet, updatePlayerMovement, launchIntoAir } from '../src/player.js';
import { distance, length, dot } from '../src/vector.js';
import { copyOfSettings } from './helpers.js';

const settings = await copyOfSettings();
const stepSeconds = 1 / 120;
const smallComet = { centre: { x: 10, y: 10 }, radius: 2 };
const bigComet = { centre: { x: 30, y: 10 }, radius: 4 };
const comets = createComets([smallComet, bigComet], settings.physics.cometSurfaceGravity);
// Far enough apart that the big comet barely tugs on a jump from the small one.
const loneComet = createComets([smallComet], settings.physics.cometSurfaceGravity);

function playerStandingOn(cometIndex, angle) {
  const player = createPlayer('player', settings.player, settings.rules);
  placeOnComet(player, comets, cometIndex, angle);
  return player;
}

function runFor(player, controls, seconds) {
  for (let step = 0; step < Math.round(seconds / stepSeconds); step += 1) {
    updatePlayerMovement(player, controls, stepSeconds, comets, settings.player);
  }
}

test('running turns at run speed divided by comet radius, so a comet twice as big takes twice as long to circle', () => {
  const onSmall = playerStandingOn(0, 0);
  const onBig = playerStandingOn(1, 0);
  const holdRight = { runDirection: 1, jumpRequested: false };
  runFor(onSmall, holdRight, 0.5);
  runFor(onBig, holdRight, 0.5);
  const expectedSmallAngle = (settings.player.runSpeed / smallComet.radius) * 0.5;
  assert.ok(Math.abs(onSmall.angleOnComet - expectedSmallAngle) < 1e-9);
  assert.ok(Math.abs(onSmall.angleOnComet / onBig.angleOnComet - 2) < 1e-9);
});

test('right arrow runs clockwise on screen: from the top of a comet it moves right', () => {
  const player = playerStandingOn(0, -Math.PI / 2);
  const startX = player.position.x;
  runFor(player, { runDirection: 1, jumpRequested: false }, 0.1);
  assert.ok(player.position.x > startX);
});

test('a grounded player stays exactly on the surface while running', () => {
  const player = playerStandingOn(0, 1);
  runFor(player, { runDirection: -1, jumpRequested: false }, 3);
  assert.ok(Math.abs(distance(player.position, smallComet.centre) - (smallComet.radius + player.bodyRadius)) < 1e-9);
});

test('jumping leaves straight outward at launch speed, keeping the running speed sideways', () => {
  const player = playerStandingOn(0, -Math.PI / 2);
  updatePlayerMovement(player, { runDirection: 1, jumpRequested: true }, stepSeconds, comets, settings.player);
  assert.equal(player.movementMode, 'airborne');
  const outward = { x: Math.cos(player.angleOnComet), y: Math.sin(player.angleOnComet) };
  const clockwise = { x: -outward.y, y: outward.x };
  const expectedSidewaysSpeed = (settings.player.runSpeed / smallComet.radius) * (smallComet.radius + player.bodyRadius);
  assert.ok(Math.abs(dot(player.velocity, outward) - settings.player.jumpLaunchSpeed) < 1e-9);
  assert.ok(Math.abs(dot(player.velocity, clockwise) - expectedSidewaysSpeed) < 1e-9);
});

test('a standing jump from a lone comet comes back down onto it at the same spot', () => {
  const player = createPlayer('player', settings.player, settings.rules);
  placeOnComet(player, loneComet, 0, -Math.PI / 2);
  const startPosition = { ...player.position };
  updatePlayerMovement(player, { runDirection: 0, jumpRequested: true }, stepSeconds, loneComet, settings.player);
  updatePlayerMovement(player, { runDirection: 0, jumpRequested: false }, stepSeconds, loneComet, settings.player);
  assert.equal(player.movementMode, 'airborne', 'must not re-land on the step right after jumping');
  for (let step = 0; step < 10 / stepSeconds && player.movementMode === 'airborne'; step += 1) {
    updatePlayerMovement(player, { runDirection: 0, jumpRequested: false }, stepSeconds, loneComet, settings.player);
  }
  assert.equal(player.movementMode, 'grounded');
  assert.ok(distance(player.position, startPosition) < 1e-6);
});

test('landing snaps to the comet touched, with the angle of the touch point, and stops the player', () => {
  const player = playerStandingOn(0, 0);
  player.movementMode = 'airborne';
  player.groundedCometIndex = null;
  // Just above the big comet's left side, falling right towards it.
  player.position = { x: bigComet.centre.x - bigComet.radius - player.bodyRadius - 0.01, y: bigComet.centre.y };
  player.velocity = { x: 3, y: 0 };
  runFor(player, { runDirection: 0, jumpRequested: false }, 0.1);
  assert.equal(player.groundedCometIndex, 1);
  assert.ok(Math.abs(player.angleOnComet - Math.PI) < 1e-9);
  assert.equal(length(player.velocity), 0);
});

test('knockback lifts a grounded player into the air', () => {
  const player = playerStandingOn(0, -Math.PI / 2);
  launchIntoAir(player, { x: 2, y: -2 });
  assert.equal(player.movementMode, 'airborne');
  assert.deepEqual(player.velocity, { x: 2, y: -2 });
});
