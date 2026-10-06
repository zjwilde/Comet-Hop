import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createVitals, applyDamage, loseLife, updateVitals, canBeHurt } from '../src/vitals.js';

const rules = { maxHealth: 100, startingLives: 3, respawnDelaySeconds: 2, respawnProtectionSeconds: 1.5 };

test('damage lowers health, and reaching zero health costs a life and starts the respawn wait', () => {
  const vitals = createVitals(rules);
  assert.equal(applyDamage(vitals, 60, rules), false);
  assert.equal(vitals.health, 40);
  assert.equal(applyDamage(vitals, 60, rules), true);
  assert.equal(vitals.livesRemaining, 2);
  assert.equal(vitals.state, 'waitingToRespawn');
});

test('after the respawn delay a character comes back at full health, briefly protected from harm', () => {
  const vitals = createVitals(rules);
  loseLife(vitals, rules);
  assert.equal(updateVitals(vitals, 1.9, rules), false);
  assert.equal(updateVitals(vitals, 0.2, rules), true);
  assert.equal(vitals.state, 'alive');
  assert.equal(vitals.health, 100);
  assert.equal(canBeHurt(vitals), false);
  assert.equal(applyDamage(vitals, 50, rules), false);
  assert.equal(vitals.health, 100);
  updateVitals(vitals, 1.5, rules);
  assert.equal(canBeHurt(vitals), true);
});

test('losing the last life eliminates the character for good', () => {
  const vitals = createVitals(rules);
  for (let life = 0; life < rules.startingLives; life += 1) {
    loseLife(vitals, rules);
    updateVitals(vitals, rules.respawnDelaySeconds, rules);
  }
  assert.equal(vitals.livesRemaining, 0);
  assert.equal(vitals.state, 'eliminated');
  assert.equal(updateVitals(vitals, 100, rules), false);
  assert.equal(vitals.state, 'eliminated');
});

test('leaving the map costs a life even while protected', () => {
  const vitals = createVitals(rules);
  vitals.protectionSecondsRemaining = 1;
  loseLife(vitals, rules);
  assert.equal(vitals.livesRemaining, 2);
});

test('a character already waiting to respawn cannot lose another life', () => {
  const vitals = createVitals(rules);
  loseLife(vitals, rules);
  loseLife(vitals, rules);
  assert.equal(vitals.livesRemaining, 2);
});
