// Shot behaviour: power from mouse distance, drill detonations, eruptions, and the aim path matching real flight.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createComets } from '../src/gravity.js';
import { createProjectile, updateProjectiles, predictFlightPath, muzzleSpeedFor, mouseDistanceForMuzzleSpeed, blastStrengthAt } from '../src/projectiles.js';
import { distance, normalize, dot } from '../src/vector.js';
import { copyOfSettings } from './helpers.js';

const settings = await copyOfSettings();
const { weapons, aiming } = settings;
const stepSeconds = 1 / settings.physics.stepsPerSecond;
const comets = createComets(settings.cometLayout, settings.physics.cometSurfaceGravity);
const outerBounds = { minimumX: -10, minimumY: -10, maximumX: 60, maximumY: 40 };

function shooterAt(position, id = 'shooter') {
  return { id, bodyRadius: 0.4, position, vitals: { state: 'alive' } };
}

function targetAt(position, id = 'target') {
  return { id, bodyRadius: 0.4, position, vitals: { state: 'alive' } };
}

test('power: mouse on the fighter gives the slowest speed, full-power distance or further the fastest', () => {
  const range = weapons.drill.muzzleSpeedRange;
  assert.equal(muzzleSpeedFor(weapons.drill, 0, aiming), range.slowest);
  assert.equal(muzzleSpeedFor(weapons.drill, aiming.mouseDistanceForFullPower, aiming), range.fastest);
  assert.equal(muzzleSpeedFor(weapons.drill, aiming.mouseDistanceForFullPower * 3, aiming), range.fastest);
});

test('power: fixed-speed weapons ignore the mouse distance', () => {
  assert.equal(muzzleSpeedFor(weapons.blaster, 0.5, aiming), weapons.blaster.projectileSpeed);
  assert.equal(muzzleSpeedFor(weapons.blaster, 50, aiming), weapons.blaster.projectileSpeed);
});

test('power: the mouse distance the bot uses for a speed gives back that speed', () => {
  for (const speed of [4, 7.5, 13]) {
    const mouseDistance = mouseDistanceForMuzzleSpeed(weapons.drill, speed, aiming);
    assert.ok(Math.abs(muzzleSpeedFor(weapons.drill, mouseDistance, aiming) - speed) < 1e-9);
  }
});

test('the aim path shows exactly where the shot really goes', () => {
  const comet = comets[0];
  const shooter = shooterAt({ x: comet.centre.x, y: comet.centre.y - comet.radius - 0.4 });
  const aimDirection = normalize({ x: 1, y: -1 });
  const predicted = predictFlightPath(shooter, aimDirection, 7, weapons.volcanoBomb, comets, outerBounds, 1, stepSeconds);
  const shot = createProjectile(shooter, aimDirection, weapons.volcanoBomb, 7);
  const flown = [{ ...shot.position }];
  const projectiles = [shot];
  for (let step = 1; step < predicted.length; step += 1) {
    updateProjectiles(projectiles, stepSeconds, comets, [], outerBounds);
    flown.push({ ...shot.position });
  }
  predicted.forEach((point, index) => assert.ok(distance(point, flown[index]) < 1e-12, `differs at step ${index}`));
});

// Fires a drill and steps until it detonates. Returns the blast, or null if it never did.
function fireDrillUntilBlast(shooter, aimDirection, muzzleSpeed) {
  const projectiles = [createProjectile(shooter, aimDirection, weapons.drill, muzzleSpeed)];
  for (let step = 0; step < 600 && projectiles.length > 0; step += 1) {
    const positionBeforeStep = { ...projectiles[0].position };
    const { blasts } = updateProjectiles(projectiles, stepSeconds, comets, [], outerBounds);
    if (blasts.length > 0) return { blast: blasts[0], projectilesLeft: projectiles.length, positionBeforeStep };
  }
  return null;
}

test('a drill bores through the first comet it meets and detonates exactly on the far surface', () => {
  const comet = comets[0];
  const shooter = shooterAt({ x: comet.centre.x - comet.radius - 0.5, y: comet.centre.y });
  const outcome = fireDrillUntilBlast(shooter, { x: 1, y: 0 }, 10);
  assert.ok(outcome, 'detonated');
  assert.equal(outcome.projectilesLeft, 0, 'the drill is used up');
  assert.ok(Math.abs(distance(outcome.blast.position, comet.centre) - comet.radius) < 1e-9, 'on the surface');
  assert.ok(outcome.blast.position.x > comet.centre.x + comet.radius * 0.9, 'on the far side');
  assert.ok(distance(outcome.positionBeforeStep, comet.centre) < comet.radius, 'detonated on the very step it came out');
  assert.deepEqual(outcome.blast.cannotHitIds, [shooter.id]);
});

test('a drill fired down into the comet you stand on detonates on its opposite side', () => {
  const comet = comets[3];
  const shooter = shooterAt({ x: comet.centre.x, y: comet.centre.y - comet.radius - 0.4 });
  const outcome = fireDrillUntilBlast(shooter, { x: 0, y: 1 }, 8);
  assert.ok(outcome, 'detonated');
  assert.ok(Math.abs(outcome.blast.position.x - comet.centre.x) < 0.05);
  assert.ok(Math.abs(outcome.blast.position.y - (comet.centre.y + comet.radius)) < 0.05, 'at the bottom of the comet');
});

test('a drill that never enters a comet never detonates', () => {
  const shooter = shooterAt({ x: 24, y: 1 });
  assert.equal(fireDrillUntilBlast(shooter, { x: 0, y: -1 }, 13), null);
});

test('blast strength is full at the centre, fades steadily, and is zero at the blast radius and beyond', () => {
  const blast = { position: { x: 0, y: 0 }, blastRadius: 2 };
  const characterAt = (x) => ({ position: { x, y: 0 }, bodyRadius: 0.5 });
  assert.equal(blastStrengthAt(blast, characterAt(0)), 1);
  assert.equal(blastStrengthAt(blast, characterAt(0.5)), 1, 'body edge touching the centre');
  assert.equal(blastStrengthAt(blast, characterAt(1.5)), 0.5);
  assert.equal(blastStrengthAt(blast, characterAt(2.5)), 0);
  assert.equal(blastStrengthAt(blast, characterAt(9)), 0);
});

test('the aim path for a drill ends exactly where it will detonate', () => {
  const comet = comets[0];
  const shooter = shooterAt({ x: comet.centre.x - comet.radius - 0.5, y: comet.centre.y - 0.6 });
  const aimDirection = normalize({ x: 1, y: 0.2 });
  const predicted = predictFlightPath(shooter, aimDirection, 9, weapons.drill, comets, outerBounds, 5, stepSeconds);
  const outcome = fireDrillUntilBlast(shooter, aimDirection, 9);
  assert.ok(distance(predicted.at(-1), outcome.blast.position) < 1e-12);
});

test('a volcano bomb hitting a comet erupts its fragments outward from the surface', () => {
  const comet = comets[0];
  const shooter = shooterAt({ x: comet.centre.x, y: comet.centre.y - comet.radius - 3 });
  const projectiles = [createProjectile(shooter, { x: 0, y: 1 }, weapons.volcanoBomb, 6)];
  for (let step = 0; step < 240 && projectiles.every((projectile) => projectile.eruption); step += 1) {
    updateProjectiles(projectiles, stepSeconds, comets, [], outerBounds);
  }
  const { eruption } = weapons.volcanoBomb;
  assert.equal(projectiles.length, eruption.fragmentCount);
  for (const fragment of projectiles) {
    assert.ok(distance(fragment.position, comet.centre) > comet.radius + fragment.radius, 'starts outside the comet');
    // Heading away from the comet: upward here, since the bomb landed on top.
    assert.ok(fragment.velocity.y < 0);
    assert.equal(fragment.damage, eruption.fragmentDamage);
    assert.equal(fragment.eruption, null, 'fragments do not erupt again');
  }
});

test('a volcano bomb bursts when it passes close to someone, throwing most of its fragments at them', () => {
  // Out in open space: a bomb flying past just above the target, never touching it.
  const shooter = shooterAt({ x: 5, y: 3 });
  const target = targetAt({ x: 12, y: 4 });
  const { eruption } = weapons.volcanoBomb;
  const projectiles = [createProjectile(shooter, { x: 1, y: 0 }, { ...weapons.volcanoBomb, gravityScale: 0 }, 8)];
  let burstAt = null;
  for (let step = 0; step < 240 && !burstAt; step += 1) {
    const before = { ...projectiles[0].position };
    updateProjectiles(projectiles, stepSeconds, [], [shooter, target], outerBounds);
    if (projectiles.some((projectile) => projectile.isFragment)) burstAt = before;
  }
  assert.ok(burstAt, 'it burst');
  assert.ok(distance(burstAt, target.position) - target.bodyRadius <= eruption.proximityFuseMetres + 0.1, 'close to the target');
  const towardsTarget = normalize({ x: target.position.x - burstAt.x, y: target.position.y - burstAt.y });
  const aimedAtTarget = projectiles.filter((fragment) => dot(normalize(fragment.velocity), towardsTarget) > Math.cos((eruption.aimedSpreadDegrees / 2 + 5) * Math.PI / 180));
  assert.ok(aimedAtTarget.length >= Math.round(eruption.fragmentCount * eruption.aimedFragmentFraction), `only ${aimedAtTarget.length} fragments head at the target`);
  // And they hit.
  const hits = [];
  for (let step = 0; step < 120; step += 1) hits.push(...updateProjectiles(projectiles, stepSeconds, [], [shooter, target], outerBounds).hits);
  assert.ok(hits.filter((hit) => hit.target === target).length >= 3, 'several fragments hit the target');
});

test('a volcano bomb never bursts near its own shooter, and (with self-damage off) its fragments never hit them', () => {
  const shooter = shooterAt({ x: 10, y: 3 });
  const target = targetAt({ x: 14, y: 3 });
  const projectiles = [createProjectile(shooter, { x: 1, y: 0 }, { ...weapons.volcanoBomb, gravityScale: 0 }, 8)];
  updateProjectiles(projectiles, stepSeconds, [], [shooter, target], outerBounds);
  assert.ok(projectiles.every((projectile) => !projectile.isFragment), 'did not burst on leaving the shooter');
  const hitsOnShooter = [];
  for (let step = 0; step < 240; step += 1) {
    // Keep the shooter close, in the fragments' way.
    shooter.position = { x: 12, y: 3 };
    hitsOnShooter.push(...updateProjectiles(projectiles, stepSeconds, [], [shooter, target], outerBounds).hits.filter((hit) => hit.target === shooter));
  }
  assert.equal(hitsOnShooter.length, 0);
});

test('a volcano bomb landing on a comet throws most fragments towards the nearest character, never into the ground', () => {
  const comet = comets[3];
  const shooter = shooterAt({ x: comet.centre.x, y: comet.centre.y - comet.radius - 6 });
  // Someone off to the right, above the comet's surface.
  const target = targetAt({ x: comet.centre.x + comet.radius + 3, y: comet.centre.y - 2 });
  const projectiles = [createProjectile(shooter, { x: 0, y: 1 }, { ...weapons.volcanoBomb, eruption: { ...weapons.volcanoBomb.eruption, proximityFuseMetres: 0 } }, 6)];
  for (let step = 0; step < 240 && projectiles.every((projectile) => !projectile.isFragment); step += 1) {
    updateProjectiles(projectiles, stepSeconds, comets, [shooter, target], outerBounds);
  }
  const { eruption } = weapons.volcanoBomb;
  assert.equal(projectiles.length, eruption.fragmentCount, 'it burst on the comet');
  const headingRight = projectiles.filter((fragment) => fragment.velocity.x > 0.5 * Math.hypot(fragment.velocity.x, fragment.velocity.y));
  assert.ok(headingRight.length >= Math.round(eruption.fragmentCount * eruption.aimedFragmentFraction), `only ${headingRight.length} head towards the target`);
  for (const fragment of projectiles) {
    const upFromSurface = normalize({ x: fragment.position.x - comet.centre.x, y: fragment.position.y - comet.centre.y });
    assert.ok(dot(normalize(fragment.velocity), upFromSurface) > 0, 'no fragment heads into the comet');
  }
});

// Fires a mortar shell and steps until it detonates. Returns { blast, hits } or null if it never did.
function fireMortarUntilBlast(shooter, aimDirection, muzzleSpeed, characters = []) {
  const projectiles = [createProjectile(shooter, aimDirection, weapons.mortar, muzzleSpeed)];
  const allHits = [];
  for (let step = 0; step < 1200 && projectiles.length > 0; step += 1) {
    const { blasts, hits } = updateProjectiles(projectiles, stepSeconds, comets, characters, outerBounds);
    allHits.push(...hits);
    if (blasts.length > 0) return { blast: blasts[0], hits: allHits, projectilesLeft: projectiles.length };
  }
  return null;
}

test('a mortar shell explodes where it lands on a comet, on the surface, with its own big blast', () => {
  const comet = comets[3];
  const shooter = shooterAt({ x: comet.centre.x - 1, y: comet.centre.y - comet.radius - 4 });
  const outcome = fireMortarUntilBlast(shooter, { x: 0, y: 1 }, 3);
  assert.ok(outcome, 'exploded');
  assert.equal(outcome.projectilesLeft, 0);
  assert.ok(Math.abs(distance(outcome.blast.position, comet.centre) - comet.radius) < 1e-9, 'on the surface');
  assert.equal(outcome.blast.blastRadius, weapons.mortar.detonation.blastRadius);
  assert.ok(weapons.mortar.detonation.blastRadius > weapons.drill.detonation.blastRadius, 'bigger than the drill blast');
});

test('a mortar shell hitting someone explodes right there, instead of a plain hit', () => {
  const shooter = shooterAt({ x: 10, y: 3 });
  const target = targetAt({ x: 12, y: 3 });
  const outcome = fireMortarUntilBlast(shooter, { x: 1, y: 0 }, 6, [shooter, target]);
  assert.ok(outcome, 'exploded');
  assert.deepEqual(outcome.hits, [], 'no plain hit');
  assert.ok(Math.abs(distance(outcome.blast.position, target.position) - target.bodyRadius) < 1e-9, 'centred on the point of contact');
  assert.ok(Math.abs(blastStrengthAt(outcome.blast, target) - 1) < 1e-9, 'full strength on the target');
});

test('the mortar is slow: its fastest shell is slower than any fixed-speed weapon', () => {
  assert.ok(weapons.mortar.muzzleSpeedRange.fastest < weapons.blaster.projectileSpeed);
  assert.ok(weapons.mortar.muzzleSpeedRange.fastest < weapons.heavyCannon.projectileSpeed);
});
