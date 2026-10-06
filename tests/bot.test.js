// The bot: it plays through the same controls as a human, aims like a person (rough guesses, learning from misses,
// rules of thumb), and doesn't throw itself away.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createGame, stepGame } from '../src/game.js';
import { HumanController } from '../src/controllers.js';
import { isDrillMoment } from '../src/bot.js';
import { predictLanding } from '../src/fighter.js';
import { copyOfSettings, createSeededRandom, noControls } from './helpers.js';

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
    isLoot: false,
    falling: false,
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
        if (landing.ownerId === 'bot' && landing.adjustablePower) misses.push(Math.hypot(landing.position.x - game.player.position.x, landing.position.y - game.player.position.y));
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

// Sets up the bot with a mortar and a volcano bomb, and the player on the neighbouring comet within their reach,
// driven by the given controls each step. Returns the game and a function giving the bot's limited ammo left.
async function ammoScenario(playerControlsAt, adjustSettings = () => {}) {
  const game = await botMatch(1, (settings) => {
    adjustSettings(settings);
    settings.crates.spawnIntervalSeconds = 1000;
    settings.bot.chanceToJumpPerDecision = 0;
    settings.bot.chanceToStandStillPerDecision = 1;
  });
  game.bot.placeOnComet(game.comets, 3, -Math.PI / 2);
  game.player.placeOnComet(game.comets, 4, Math.PI * 0.75);
  game.bot.arsenal.carriedWeapons.push({ weaponName: 'mortar', ammoRemaining: 3 }, { weaponName: 'volcanoBomb', ammoRemaining: 3 });
  let elapsed = 0;
  game.player.controller = new HumanController(() => playerControlsAt(elapsed, game));
  const limitedAmmoLeft = () => game.bot.arsenal.carriedWeapons.filter((carried) => carried.ammoRemaining !== null).reduce((total, carried) => total + carried.ammoRemaining, 0);
  const play = (seconds) => {
    for (let step = 0; step < seconds / stepSeconds; step += 1) {
      stepGame(game, stepSeconds);
      elapsed += stepSeconds;
    }
  };
  return { game, limitedAmmoLeft, play };
}

const runningBackAndForth = (elapsed, game) => ({ ...noControls, runDirection: Math.floor(elapsed) % 2 === 0 ? 1 : -1, aimPoint: { ...game.player.position } });

test('the bot saves limited ammo against a healthy target moving about on the ground', async () => {
  const { game, limitedAmmoLeft, play } = await ammoScenario(runningBackAndForth);
  makePlayerUnhurtable(game);
  play(15);
  assert.equal(limitedAmmoLeft(), 6, 'kept every mortar and volcano shot');
});

test('the bot spends limited ammo on a target that is in the air and cannot dodge', async () => {
  const hoppingInPlace = (elapsed, game) => ({ ...noControls, jumpRequested: game.player.movementMode === 'grounded', aimPoint: { ...game.player.position } });
  const { game, limitedAmmoLeft, play } = await ammoScenario(hoppingInPlace);
  makePlayerUnhurtable(game);
  play(15);
  assert.ok(limitedAmmoLeft() < 6, 'spent some');
});

test('the bot spends limited ammo to finish off a target that is nearly dead', async () => {
  // A harmless blaster, so the player stays nearly dead (rather than dying and respawning, standing still) and only
  // the "finish them off" reason applies.
  const { game, limitedAmmoLeft, play } = await ammoScenario(runningBackAndForth, (settings) => { settings.weapons.blaster.damage = 0; });
  game.player.vitals.health = 20;
  play(15);
  assert.ok(limitedAmmoLeft() < 6, 'spent some');
});

test('the bot goes and gets a loot crate once it lands, even several comets away', async () => {
  const game = await botMatch(3, (settings) => {
    settings.crates.spawnIntervalSeconds = 1000;
    settings.bot.chanceToJumpPerDecision = 0;
  });
  game.bot.placeOnComet(game.comets, 0, -Math.PI / 2);
  // The player is far away on the same side, and can't be hurt, so the bot has no reason to go anywhere but the loot.
  game.player.placeOnComet(game.comets, 1, Math.PI / 2);
  makePlayerUnhurtable(game);
  const farComet = game.comets[6];
  game.crateSpawner.crates.push({
    isLoot: true, falling: false, velocity: { x: 0, y: 0 }, cometIndex: 6, angleOnComet: -Math.PI / 2,
    position: { x: farComet.centre.x, y: farComet.centre.y - farComet.radius - game.settings.crates.size / 2 },
    weaponNames: ['drill', 'barrage'], secondsRemaining: 60,
  });
  for (let step = 0; step < 40 / stepSeconds && !game.bot.arsenal.carriedWeapons.some((carried) => carried.weaponName === 'barrage'); step += 1) {
    stepGame(game, stepSeconds);
  }
  assert.ok(game.bot.arsenal.carriedWeapons.some((carried) => carried.weaponName === 'barrage'), 'collected the loot');
});

test('an easy bot does not save limited ammo: it spends it even on a healthy target moving about', async () => {
  const { game, limitedAmmoLeft, play } = await ammoScenario(runningBackAndForth, (settings) => { settings.bot.savesLimitedAmmo = false; });
  makePlayerUnhurtable(game);
  play(15);
  assert.ok(limitedAmmoLeft() < 6, 'spent some');
});

test('with no shot at its enemy, the bot takes Blaster shots at a drone in reach, never spending limited ammo on it', async () => {
  const game = await botMatch(5, (settings) => {
    settings.drone.includeInMatch = true;
    // Parked and quiet, so the test is only about the bot's shooting.
    settings.drone.cruiseSpeed = 0;
    settings.drone.secondsBetweenVolleys = 1000;
    settings.crates.spawnIntervalSeconds = 1000;
  });
  game.bot.placeOnComet(game.comets, 0, -Math.PI / 2);
  // The enemy is far across the map: no shot at it from here.
  game.player.placeOnComet(game.comets, 6, -Math.PI / 2);
  makePlayerUnhurtable(game);
  game.drone.position = { x: game.bot.position.x, y: game.bot.position.y - 4 };
  game.drone.waypoint = { ...game.drone.position };
  game.bot.arsenal.carriedWeapons.push({ weaponName: 'mortar', ammoRemaining: 3 });
  for (let step = 0; step < 3 / stepSeconds; step += 1) stepGame(game, stepSeconds);
  assert.ok(game.drone.vitals.health < game.drone.rules.maxHealth || game.drone.vitals.state !== 'alive', 'the drone was hit');
  assert.equal(game.bot.arsenal.carriedWeapons[1].ammoRemaining, 3, 'no mortar shells spent');
});

// The bot with a few drills, the player placed where the test says, and no crates or jumping to muddy things.
async function drillScenario({ botComet, botAngle, playerComet, playerAngle }) {
  const game = await botMatch(6, (settings) => {
    settings.crates.spawnIntervalSeconds = 1000;
    settings.bot.chanceToJumpPerDecision = 0;
  });
  game.bot.placeOnComet(game.comets, botComet, botAngle);
  game.player.placeOnComet(game.comets, playerComet, playerAngle);
  game.bot.arsenal.carriedWeapons.push({ weaponName: 'drill', ammoRemaining: 3 });
  const drillsLeft = () => game.bot.arsenal.carriedWeapons.find((carried) => carried.weaponName === 'drill')?.ammoRemaining ?? 0;
  const playFor = (seconds, until = () => false) => {
    for (let step = 0; step < seconds / stepSeconds && !until(); step += 1) stepGame(game, stepSeconds);
  };
  return { game, drillsLeft, playFor };
}

const angleBetween = (game, fromComet, toComet) => Math.atan2(game.comets[toComet].centre.y - game.comets[fromComet].centre.y, game.comets[toComet].centre.x - game.comets[fromComet].centre.x);

test('the bot drills straight through its own comet at an enemy hiding on the far side, hitting first time', async () => {
  const { game, drillsLeft, playFor } = await drillScenario({ botComet: 5, botAngle: -Math.PI / 2, playerComet: 5, playerAngle: Math.PI / 2 });
  playFor(5, () => game.player.vitals.health < game.settings.rules.maxHealth);
  assert.ok(game.player.vitals.health < game.settings.rules.maxHealth, 'it hit');
  assert.equal(drillsLeft(), 2, 'with its first drill');
});

test('from a neighbouring comet, the bot drills through the enemy\'s comet at an enemy hiding behind it', async () => {
  const probe = await botMatch(6);
  const facing = angleBetween(probe, 3, 4);
  const { game, drillsLeft, playFor } = await drillScenario({ botComet: 3, botAngle: facing, playerComet: 4, playerAngle: facing });
  playFor(5, () => game.player.vitals.health < game.settings.rules.maxHealth);
  assert.ok(game.player.vitals.health < game.settings.rules.maxHealth, 'it hit');
  assert.equal(drillsLeft(), 2, 'with its first drill');
});

test('otherwise the bot keeps its drills in reserve: an enemy in the air is not a reason to spend one', async () => {
  const probe = await botMatch(6);
  const facing = angleBetween(probe, 3, 4);
  // The enemy in plain view on the near side of the neighbouring comet, in the air (an ordinary good moment).
  const { game } = await drillScenario({ botComet: 3, botAngle: facing, playerComet: 4, playerAngle: facing + Math.PI });
  game.player.launchIntoAir({ x: 0, y: -1 });
  const punch = game.settings.weapons.drill.damage + game.settings.weapons.drill.detonation.damageAtCentre;
  assert.equal(game.bot.controller.isGoodMomentToSpend(game, game.bot, game.player, 'drill', punch), false, 'not for a drill');
  assert.equal(game.bot.controller.isGoodMomentToSpend(game, game.bot, game.player, 'heavyCannon', 30), true, 'though it is for other weapons');
  game.player.vitals.health = 10;
  assert.equal(game.bot.controller.isGoodMomentToSpend(game, game.bot, game.player, 'drill', punch), true, 'but a drill can finish someone off');
});

test('the bot drills the spot where its enemy is about to land, timed so the blast catches them coming down', async () => {
  // The enemy keeps hopping straight up from the far side of the bot's comet, coming back down out of sight.
  const { game, drillsLeft } = await drillScenario({ botComet: 5, botAngle: -Math.PI / 2, playerComet: 5, playerAngle: Math.PI / 2 });
  game.player.controller = new HumanController(() => ({ ...noControls, jumpRequested: game.player.movementMode === 'grounded', aimPoint: { ...game.player.position } }));
  const comet = game.comets[5];
  let drillsFiredWhileAirborne = 0;
  let hitsJustAboveTheSurface = 0;
  for (let step = 0; step < 10 / stepSeconds; step += 1) {
    const drillsBefore = drillsLeft();
    const healthBefore = game.player.vitals.health;
    const wasAirborne = game.player.movementMode === 'airborne';
    const heightAboveSurface = Math.hypot(game.player.position.x - comet.centre.x, game.player.position.y - comet.centre.y) - comet.radius - game.player.bodyRadius;
    stepGame(game, stepSeconds);
    if (drillsLeft() < drillsBefore && wasAirborne) drillsFiredWhileAirborne += 1;
    // The blast goes off just as they come down: in the air, within a metre of the comet's surface.
    if (game.player.vitals.health < healthBefore && wasAirborne && heightAboveSurface < 1) hitsJustAboveTheSurface += 1;
  }
  assert.ok(drillsFiredWhileAirborne >= 1, 'fired a drill while the enemy was still in the air');
  assert.ok(hitsJustAboveTheSurface >= 1, 'and the blast caught them coming down');
});

test('it is only a drill moment when the comet a drill would bore into first is the one the enemy stands on', async () => {
  const { game } = await drillScenario({ botComet: 1, botAngle: 0, playerComet: 5, playerAngle: Math.PI });
  // Facing each other across the bottom row: comet 3 sits between them. A drill would come out of comet 3, not near them.
  assert.equal(isDrillMoment(game, game.bot, game.player), false, 'another comet is in the way first');
  // Behind its own comet from where the bot stands: the right comet.
  game.player.placeOnComet(game.comets, 3, 0);
  game.bot.placeOnComet(game.comets, 3, Math.PI);
  assert.equal(isDrillMoment(game, game.bot, game.player), true, 'same comet, far side');
  // In plain view: no need to drill.
  game.player.placeOnComet(game.comets, 3, Math.PI - 0.3);
  assert.equal(isDrillMoment(game, game.bot, game.player), false, 'in plain view');
});

test('the landing drill waits for the moment the drill would arrive as its enemy lands, not as soon as it sees the landing', async () => {
  const { game } = await drillScenario({ botComet: 5, botAngle: -Math.PI / 2, playerComet: 5, playerAngle: Math.PI / 2 });
  const comet = game.comets[5];
  // The enemy drops from well below the comet, falling straight back up onto its underside, out of the bot's sight.
  game.player.movementMode = 'airborne';
  game.player.groundedCometIndex = null;
  game.player.position = { x: comet.centre.x, y: comet.centre.y + comet.radius + 6 };
  game.player.velocity = { x: 0, y: 0 };
  const drill = game.settings.weapons.drill;
  const momentsItWantedToFire = [];
  for (let step = 0; step < 5 / stepSeconds && game.player.movementMode === 'airborne'; step += 1) {
    const landing = predictLanding(game.player, game.comets, stepSeconds, 10);
    if (game.bot.controller.landingDrillAim(game, game.bot, game.player)) {
      // Other comets pull the falling enemy a little sideways, so measure to where it will really land.
      const fromCentre = Math.hypot(landing.position.x - comet.centre.x, landing.position.y - comet.centre.y);
      const comesOutAt = { x: comet.centre.x + ((landing.position.x - comet.centre.x) / fromCentre) * comet.radius, y: comet.centre.y + ((landing.position.y - comet.centre.y) / fromCentre) * comet.radius };
      const drillSeconds = Math.hypot(comesOutAt.x - game.bot.position.x, comesOutAt.y - game.bot.position.y) / drill.muzzleSpeedRange.fastest;
      momentsItWantedToFire.push({ secondsLeft: landing.seconds, drillSeconds });
    }
    game.player.updateMovement(noControls, stepSeconds, game.comets, game.settings.fighter);
  }
  assert.ok(momentsItWantedToFire.length > 0, 'it wanted to fire at some point');
  for (const { secondsLeft, drillSeconds } of momentsItWantedToFire) {
    assert.ok(Math.abs(secondsLeft - drillSeconds) <= game.settings.bot.landingDrillTimingSeconds + 1e-9, `wanted to fire with ${secondsLeft.toFixed(2)} s left; the drill takes ${drillSeconds.toFixed(2)} s`);
  }
  assert.ok(momentsItWantedToFire.every(({ secondsLeft }) => secondsLeft < 1), 'not while the landing was still far off');
});
