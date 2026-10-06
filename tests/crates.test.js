// Crates: loot crates fall onto a comet so they can always be reached.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createComets } from '../src/gravity.js';
import { createCrateSpawner, updateCrates, dropLootCrate, collectTouchedCrates } from '../src/crates.js';
import { distance } from '../src/vector.js';
import { copyOfSettings, createSeededRandom } from './helpers.js';

const settings = await copyOfSettings();
const comets = createComets(settings.cometLayout, settings.physics.cometSurfaceGravity);
const stepSeconds = 1 / settings.physics.stepsPerSecond;
// No ordinary crates, so only the loot crate is in play.
const crateSettings = { ...settings.crates, spawnIntervalSeconds: 1e9 };

test('a loot crate dropped anywhere in the world falls and comes to rest on a comet surface', () => {
  const random = createSeededRandom(1);
  for (let x = 1; x < settings.world.widthMetres; x += 3) {
    for (let y = 1; y < settings.world.heightMetres; y += 3) {
      if (comets.some((comet) => distance(comet.centre, { x, y }) < comet.radius + 1)) continue;
      const spawner = createCrateSpawner(crateSettings);
      dropLootCrate(spawner, { x, y }, settings.drone, random);
      const [crate] = spawner.crates;
      for (let step = 0; step < 15 / stepSeconds && crate.falling; step += 1) {
        updateCrates(spawner, stepSeconds, comets, crateSettings, random, settings.world);
      }
      assert.equal(crate.falling, false, `dropped at ${x},${y}: still falling`);
      const comet = comets[crate.cometIndex];
      assert.ok(Math.abs(distance(crate.position, comet.centre) - (comet.radius + crateSettings.size / 2)) < 1e-9, `dropped at ${x},${y}: not on the surface`);
    }
  }
});

test('a loot crate can be grabbed while it is still falling', () => {
  const spawner = createCrateSpawner(crateSettings);
  dropLootCrate(spawner, { x: 24, y: 2 }, settings.drone, createSeededRandom(2));
  const jumper = { bodyRadius: 0.4, position: { x: 24, y: 2.3 } };
  assert.equal(collectTouchedCrates(spawner, jumper, crateSettings).length, 1);
});

test('a loot crate that would leave the world, or never touch down, is set down on the nearest comet', () => {
  for (const [startingVelocity, description] of [[{ x: -60, y: 0 }, 'thrown out of the world'], [{ x: 0, y: 0 }, 'falling too long']]) {
    const spawner = createCrateSpawner(crateSettings);
    dropLootCrate(spawner, { x: 3, y: 2 }, settings.drone, createSeededRandom(3));
    const [crate] = spawner.crates;
    crate.velocity = startingVelocity;
    if (description === 'falling too long') crate.secondsFalling = 10;
    // Well under a second either way: the thrown one crosses the world's edge after a few steps.
    for (let step = 0; step < 60 && crate.falling; step += 1) updateCrates(spawner, stepSeconds, comets, crateSettings, createSeededRandom(3), settings.world);
    assert.equal(crate.falling, false, description);
    const comet = comets[crate.cometIndex];
    assert.ok(Math.abs(distance(crate.position, comet.centre) - (comet.radius + crateSettings.size / 2)) < 1e-9, `${description}: on a comet surface`);
  }
});
