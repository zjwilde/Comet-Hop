import { test } from 'node:test';
import assert from 'node:assert/strict';
import { gravityAt, createComets } from '../src/gravity.js';
import { length } from '../src/vector.js';

const singleComet = createComets([{ centre: { x: 10, y: 10 }, radius: 2 }], 9);

test('gravity at a comet surface equals the chosen surface gravity, pointing at the centre', () => {
  const pullAtRightEdge = gravityAt({ x: 12, y: 10 }, singleComet);
  assert.ok(Math.abs(pullAtRightEdge.x - -9) < 1e-12);
  assert.ok(Math.abs(pullAtRightEdge.y) < 1e-12);
});

test('gravity falls off with the square of distance from the centre', () => {
  const pullAtTwoMetres = length(gravityAt({ x: 10, y: 12 }, singleComet));
  const pullAtFourMetres = length(gravityAt({ x: 10, y: 14 }, singleComet));
  assert.ok(Math.abs(pullAtTwoMetres / pullAtFourMetres - 4) < 1e-12);
});

test('gravity from several comets is summed: equal comets cancel exactly halfway between them', () => {
  const twinComets = createComets([{ centre: { x: 0, y: 0 }, radius: 2 }, { centre: { x: 10, y: 0 }, radius: 2 }], 9);
  const pullAtMidpoint = gravityAt({ x: 5, y: 0 }, twinComets);
  assert.ok(length(pullAtMidpoint) < 1e-12);
});

test('gravity at a comet centre is skipped rather than dividing by zero', () => {
  const pull = gravityAt({ x: 10, y: 10 }, singleComet);
  assert.deepEqual(pull, { x: 0, y: 0 });
});
