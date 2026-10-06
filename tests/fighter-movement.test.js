import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createComets } from '../src/gravity.js';
import { Fighter, predictLanding } from '../src/fighter.js';
import { IdleController } from '../src/controllers.js';
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
  const player = new Fighter('player', new IdleController(), settings.fighter, settings.rules);
  player.placeOnComet(comets, cometIndex, angle);
  return player;
}

function runFor(player, controls, seconds) {
  for (let step = 0; step < Math.round(seconds / stepSeconds); step += 1) {
    player.updateMovement(controls, stepSeconds, comets, settings.fighter);
  }
}

test('running turns at run speed divided by comet radius, so a comet twice as big takes twice as long to circle', () => {
  const onSmall = playerStandingOn(0, 0);
  const onBig = playerStandingOn(1, 0);
  const holdRight = { runDirection: 1, jumpRequested: false };
  runFor(onSmall, holdRight, 0.5);
  runFor(onBig, holdRight, 0.5);
  const expectedSmallAngle = (settings.fighter.runSpeed / smallComet.radius) * 0.5;
  assert.ok(Math.abs(onSmall.angleOnComet - expectedSmallAngle) < 1e-9);
  assert.ok(Math.abs(onSmall.angleOnComet / onBig.angleOnComet - 2) < 1e-9);
});

test('running clockwise (the D key) on screen: from the top of a comet it moves right', () => {
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
  player.updateMovement({ runDirection: 1, jumpRequested: true }, stepSeconds, comets, settings.fighter);
  assert.equal(player.movementMode, 'airborne');
  const outward = { x: Math.cos(player.angleOnComet), y: Math.sin(player.angleOnComet) };
  const clockwise = { x: -outward.y, y: outward.x };
  const expectedSidewaysSpeed = (settings.fighter.runSpeed / smallComet.radius) * (smallComet.radius + player.bodyRadius);
  assert.ok(Math.abs(dot(player.velocity, outward) - settings.fighter.jumpLaunchSpeed) < 1e-9);
  assert.ok(Math.abs(dot(player.velocity, clockwise) - expectedSidewaysSpeed) < 1e-9);
});

test('a standing jump from a lone comet comes back down onto it at the same spot', () => {
  const player = new Fighter('player', new IdleController(), settings.fighter, settings.rules);
  player.placeOnComet(loneComet, 0, -Math.PI / 2);
  const startPosition = { ...player.position };
  player.updateMovement({ runDirection: 0, jumpRequested: true }, stepSeconds, loneComet, settings.fighter);
  player.updateMovement({ runDirection: 0, jumpRequested: false }, stepSeconds, loneComet, settings.fighter);
  assert.equal(player.movementMode, 'airborne', 'must not re-land on the step right after jumping');
  for (let step = 0; step < 10 / stepSeconds && player.movementMode === 'airborne'; step += 1) {
    player.updateMovement({ runDirection: 0, jumpRequested: false }, stepSeconds, loneComet, settings.fighter);
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
  player.launchIntoAir({ x: 2, y: -2 });
  assert.equal(player.movementMode, 'airborne');
  assert.deepEqual(player.velocity, { x: 2, y: -2 });
});

test('predicting where an airborne fighter lands gives exactly where and when it really does', () => {
  const realComets = createComets(settings.cometLayout, settings.physics.cometSurfaceGravity);
  for (const [cometIndex, angle, runDirection] of [[0, -1, 1], [3, 2, -1], [5, -2.5, 0]]) {
    const fighter = new Fighter('player', new IdleController(), settings.fighter, settings.rules);
    fighter.placeOnComet(realComets, cometIndex, angle);
    fighter.updateMovement({ runDirection, jumpRequested: true }, stepSeconds, realComets, settings.fighter);
    const predicted = predictLanding(fighter, realComets, stepSeconds, 10);
    let seconds = 0;
    while (fighter.movementMode === 'airborne' && seconds < 10) {
      fighter.updateMovement({ runDirection: 0, jumpRequested: false }, stepSeconds, realComets, settings.fighter);
      seconds += stepSeconds;
    }
    assert.ok(predicted, 'predicted a landing');
    assert.equal(predicted.cometIndex, fighter.groundedCometIndex);
    assert.ok(Math.abs(predicted.seconds - seconds) < 1e-9, `landing time: predicted ${predicted.seconds}, really ${seconds}`);
    assert.ok(distance(predicted.position, fighter.position) < 0.2, 'landing spot');
  }
});
