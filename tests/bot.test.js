// The bot: it plays through the same controls as a human, aims like a person (rough guesses, learning from misses,
// rules of thumb), and doesn't throw itself away.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createGame, stepGame } from '../src/game.js';
import { copyOfSettings, createSeededRandom } from './helpers.js';

const stepSeconds = 1 / 120;

async function botMatch(seed, adjustSettings = () => {}) {
  const settings = await copyOfSettings();
  settings.drone.includeInMatch = false;
  adjustSettings(settings);
  return createGame(settings, createSeededRandom(seed));
}

// Keeps the player from being hurt, so a long test isn't cut short by the bot winning.
function makePlayerUnhurtable(game) {
  game.player.vitals.protectionSecondsRemaining = Infinity;
}

test('the bot hits a player who stands still, within half a minute', async () => {
  for (const seed of [1, 2, 3]) {
    const game = await botMatch(seed);
    for (let step = 0; step < 30 / stepSeconds && game.player.vitals.health === game.settings.rules.maxHealth; step += 1) {
      // The player has an idle controller: it stands still, so only the bot's aiming is being tested.
      stepGame(game, stepSeconds);
    }
    assert.ok(game.player.vitals.health < game.settings.rules.maxHealth, `seed ${seed}: bot never hit`);
  }
});

test('the bot moves around: it runs and jumps to other comets', async () => {
  const game = await botMatch(4);
  makePlayerUnhurtable(game);
  const cometsVisited = new Set([game.bot.groundedCometIndex]);
  for (let step = 0; step < 60 / stepSeconds; step += 1) {
    stepGame(game, stepSeconds);
    if (game.bot.movementMode === 'grounded') cometsVisited.add(game.bot.groundedCometIndex);
  }
  assert.ok(cometsVisited.size >= 3, `visited only ${cometsVisited.size} comets`);
});

test('the bot never jumps off the map by itself', async () => {
  for (const seed of [5, 6, 7]) {
    // Self-damage off, so nothing but its own movement can move it.
    const game = await botMatch(seed, (settings) => { settings.rules.shotsCanHurtTheirShooter = false; });
    makePlayerUnhurtable(game);
    for (let step = 0; step < 120 / stepSeconds; step += 1) stepGame(game, stepSeconds);
    assert.equal(game.bot.vitals.livesRemaining, game.settings.rules.startingLives, `seed ${seed}`);
  }
});

test('the bot heads for a crate on its own comet and collects it', async () => {
  const game = await botMatch(8, (settings) => {
    settings.bot.chanceToJumpPerDecision = 0;
  });
  const comet = game.comets[game.bot.groundedCometIndex];
  const crateAngle = game.bot.angleOnComet + 2;
  game.crateSpawner.crates.push({
    floating: false,
    cometIndex: game.bot.groundedCometIndex,
    angleOnComet: crateAngle,
    position: { x: comet.centre.x + Math.cos(crateAngle) * (comet.radius + 0.35), y: comet.centre.y + Math.sin(crateAngle) * (comet.radius + 0.35) },
    weaponNames: ['drill'],
    secondsRemaining: null,
  });
  for (let step = 0; step < 10 / stepSeconds && game.bot.arsenal.carriedWeapons.length === 1; step += 1) {
    stepGame(game, stepSeconds);
  }
  assert.equal(game.bot.arsenal.carriedWeapons.at(-1).weaponName, 'drill');
});

test('with self-damage on, the bot does not blow itself up with a volcano bomb at a target standing right beside it', async () => {
  for (const seed of [9, 10, 11]) {
    const game = await botMatch(seed, (settings) => {
      settings.bot.chanceToJumpPerDecision = 0;
      settings.crates.spawnIntervalSeconds = 1000;
    });
    assert.equal(game.settings.rules.shotsCanHurtTheirShooter, true, 'self-damage is on by default');
    game.bot.arsenal.carriedWeapons.push({ weaponName: 'volcanoBomb', ammoRemaining: 99 });
    game.bot.arsenal.selectedIndex = 1;
    game.player.placeOnComet(game.comets, game.bot.groundedCometIndex, game.bot.angleOnComet + 0.6);
    // Unhurtable, so it stays right beside the bot instead of respawning somewhere far away.
    makePlayerUnhurtable(game);
    for (let step = 0; step < 10 / stepSeconds; step += 1) stepGame(game, stepSeconds);
    assert.equal(game.bot.vitals.health, game.settings.rules.maxHealth, `seed ${seed}`);
    assert.equal(game.bot.arsenal.carriedWeapons[game.bot.arsenal.selectedIndex].weaponName, 'blaster', 'switched to the blaster up close');
  }
});

test('the bot learns from misses: its lobs come down much closer to a target that stays put, one lob at a time', async () => {
  for (const [botComet, playerComet] of [[2, 4], [0, 2], [3, 5]]) {
    const game = await botMatch(1, (settings) => {
      settings.crates.spawnIntervalSeconds = 1000;
      settings.bot.chanceToJumpPerDecision = 0;
      settings.bot.chanceToStandStillPerDecision = 1;
      // No random wobble, so only learning changes the aim.
      settings.bot.aimWobbleDegrees = 0;
      settings.bot.powerWobbleFraction = 0;
    });
    game.bot.placeOnComet(game.comets, botComet, -Math.PI / 2);
    game.player.placeOnComet(game.comets, playerComet, -Math.PI / 2);
    makePlayerUnhurtable(game);
    game.bot.arsenal.carriedWeapons.push({ weaponName: 'volcanoBomb', ammoRemaining: 99 });
    game.bot.arsenal.selectedIndex = 1;
    const misses = [];
    let mostLobsInTheAirAtOnce = 0;
    for (let step = 0; step < 40 / stepSeconds && misses.length < 8; step += 1) {
      stepGame(game, stepSeconds);
      const lobsInTheAir = game.projectiles.filter((projectile) => projectile.ownerId === 'bot' && projectile.adjustablePower).length;
      mostLobsInTheAirAtOnce = Math.max(mostLobsInTheAirAtOnce, lobsInTheAir);
      for (const landing of game.latestLandings) {
        if (landing.ownerId === 'bot') misses.push(Math.hypot(landing.position.x - game.player.position.x, landing.position.y - game.player.position.y));
      }
    }
    assert.equal(mostLobsInTheAirAtOnce, 1, 'watches each lob land before firing the next');
    const [firstMiss, ...laterMisses] = misses;
    assert.ok(Math.min(...laterMisses) < firstMiss / 3, `comet ${botComet} -> ${playerComet}: misses ${misses.map((miss) => miss.toFixed(1)).join(' ')}`);
  }
});

test('the bot runs from a bursting shell coming down beside it', async () => {
  const game = await botMatch(1, (settings) => { settings.bot.chanceToStandStillPerDecision = 1; });
  const comet = game.comets[game.bot.groundedCometIndex];
  // A shell falling onto the comet just clockwise of the bot, heading for it.
  const fallingAt = game.bot.angleOnComet + 0.5;
  const shellPosition = { x: comet.centre.x + Math.cos(fallingAt) * (comet.radius + 1.5), y: comet.centre.y + Math.sin(fallingAt) * (comet.radius + 1.5) };
  game.projectiles.push({ ...game.projectiles[0], ownerId: 'player', position: shellPosition, velocity: { x: (game.bot.position.x - shellPosition.x), y: (game.bot.position.y - shellPosition.y) }, eruption: game.settings.weapons.volcanoBomb.eruption, isFragment: false, detonation: null });
  const controls = game.bot.controller.decideControls(game, game.bot, stepSeconds);
  assert.equal(controls.runDirection, -1, 'runs counterclockwise, away from it');
});

test('the bot keeps its mortar for targets beyond the reach of its big blast', async () => {
  const game = await botMatch(12, (settings) => {
    settings.bot.chanceToJumpPerDecision = 0;
    settings.crates.spawnIntervalSeconds = 1000;
  });
  game.bot.arsenal.carriedWeapons.push({ weaponName: 'mortar', ammoRemaining: 99 });
  game.bot.arsenal.selectedIndex = 1;
  // Facing each other across the gap between comets 1 and 2, about 4.5 m apart: beyond the general point-blank
  // distance, but inside the mortar's blast radius plus a step back. (From here a mortar lob is otherwise possible.)
  const [botComet, playerComet] = [game.comets[1], game.comets[2]];
  const angleFacing = (from, to) => Math.atan2(to.centre.y - from.centre.y, to.centre.x - from.centre.x);
  game.bot.placeOnComet(game.comets, 1, angleFacing(botComet, playerComet));
  game.player.placeOnComet(game.comets, 2, angleFacing(playerComet, botComet));
  makePlayerUnhurtable(game);
  const separation = Math.hypot(game.player.position.x - game.bot.position.x, game.player.position.y - game.bot.position.y);
  assert.ok(separation > game.settings.bot.pointBlankMetres && separation < game.settings.weapons.mortar.detonation.blastRadius + 1.5, `separation ${separation.toFixed(1)}`);
  for (let step = 0; step < 5 / stepSeconds; step += 1) stepGame(game, stepSeconds);
  assert.equal(game.bot.arsenal.carriedWeapons[1].ammoRemaining, 99, 'never fired the mortar');
  assert.equal(game.bot.vitals.health, game.settings.rules.maxHealth);
});

test('with a mortar the bot rarely hurts itself, yet still lands its shells near its target', async () => {
  let mortarShots = 0;
  let selfHits = 0;
  let landingsNearTarget = 0;
  // Twenty one-minute games: the mortar's useful range is narrow, so it only comes out a couple of times a minute.
  for (let seed = 1; seed <= 20; seed += 1) {
    const game = await botMatch(seed, (settings) => { settings.crates.spawnIntervalSeconds = 1000; });
    game.bot.arsenal.carriedWeapons.push({ weaponName: 'mortar', ammoRemaining: 999 });
    game.bot.arsenal.selectedIndex = 1;
    makePlayerUnhurtable(game);
    const blastReach = game.settings.weapons.mortar.detonation.blastRadius + game.player.bodyRadius;
    for (let step = 0; step < 60 / stepSeconds; step += 1) {
      const healthBefore = game.bot.vitals.health;
      const livesBefore = game.bot.vitals.livesRemaining;
      stepGame(game, stepSeconds);
      for (const landing of game.latestLandings) {
        if (landing.ownerId !== 'bot' || !landing.adjustablePower) continue;
        mortarShots += 1;
        if (Math.hypot(landing.position.x - game.player.position.x, landing.position.y - game.player.position.y) < blastReach) landingsNearTarget += 1;
      }
      if (game.bot.vitals.health < healthBefore || game.bot.vitals.livesRemaining < livesBefore) selfHits += 1;
    }
  }
  assert.ok(mortarShots >= 20, `only ${mortarShots} mortar shots`);
  // About 2% now; without stepping back from its own lobs it was about 10%, before the fixes nearly 30%.
  assert.ok(selfHits <= mortarShots * 0.05, `${selfHits} self-hits from ${mortarShots} shots`);
  assert.ok(landingsNearTarget >= mortarShots * 0.5, `only ${landingsNearTarget} of ${mortarShots} landed near the target`);
});
