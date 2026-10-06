import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createArsenal, tryFire, updateArsenalCooldown, giveWeapon, selectNextWeapon, selectedWeapon } from '../src/weapons.js';
import { copyOfSettings } from './helpers.js';

const { weapons } = await copyOfSettings();

test('a weapon cannot fire again until its cooldown has passed', () => {
  const arsenal = createArsenal();
  assert.ok(tryFire(arsenal, weapons));
  assert.equal(tryFire(arsenal, weapons), null);
  updateArsenalCooldown(arsenal, weapons.blaster.cooldownSeconds);
  assert.ok(tryFire(arsenal, weapons));
});

test('the starting blaster never runs out', () => {
  const arsenal = createArsenal();
  for (let shot = 0; shot < 1000; shot += 1) {
    assert.ok(tryFire(arsenal, weapons));
    updateArsenalCooldown(arsenal, 10);
  }
  assert.equal(selectedWeapon(arsenal).weaponName, 'blaster');
});

test('a collected weapon is selected at once, and is dropped (back to the blaster) when its ammo runs out', () => {
  const arsenal = createArsenal();
  giveWeapon(arsenal, 'heavyCannon', weapons);
  assert.equal(selectedWeapon(arsenal).weaponName, 'heavyCannon');
  for (let shot = 0; shot < weapons.heavyCannon.ammoPerPickup; shot += 1) {
    assert.equal(tryFire(arsenal, weapons), weapons.heavyCannon);
    updateArsenalCooldown(arsenal, 10);
  }
  assert.equal(arsenal.carriedWeapons.length, 1);
  assert.equal(selectedWeapon(arsenal).weaponName, 'blaster');
});

test('collecting a weapon already carried adds its ammo instead of a second copy', () => {
  const arsenal = createArsenal();
  giveWeapon(arsenal, 'heavyCannon', weapons);
  giveWeapon(arsenal, 'heavyCannon', weapons);
  assert.equal(arsenal.carriedWeapons.length, 2);
  assert.equal(selectedWeapon(arsenal).ammoRemaining, 2 * weapons.heavyCannon.ammoPerPickup);
});

test('switching weapons cycles through everything carried and wraps around', () => {
  const arsenal = createArsenal();
  giveWeapon(arsenal, 'heavyCannon', weapons);
  selectNextWeapon(arsenal);
  assert.equal(selectedWeapon(arsenal).weaponName, 'blaster');
  selectNextWeapon(arsenal);
  assert.equal(selectedWeapon(arsenal).weaponName, 'heavyCannon');
});
