// Weapon crates. Ordinary crates appear on a random spot on a random comet's surface every so often. Loot crates are
// dropped by the drone where it dies: they fall under the comets' gravity and come to rest on a comet, so one is never
// out of reach, hold the special weapon plus a bonus weapon, and vanish if not collected in time.
// Touching any crate collects it, including a loot crate still falling.
import { add, subtract, scale, normalize, distance, directionFromAngle } from './vector.js';
import { gravityAt } from './gravity.js';

export function createCrateSpawner(crateSettings) {
  return { crates: [], secondsUntilNextSpawn: crateSettings.spawnIntervalSeconds };
}

function pickOne(choices, random) {
  return choices[Math.floor(random() * choices.length)];
}

// Sets a crate down on a comet's surface at the given angle.
function restOnComet(crate, comets, cometIndex, angleOnComet, crateSize) {
  const comet = comets[cometIndex];
  crate.falling = false;
  crate.velocity = { x: 0, y: 0 };
  crate.cometIndex = cometIndex;
  crate.angleOnComet = angleOnComet;
  crate.position = add(comet.centre, scale(directionFromAngle(angleOnComet), comet.radius + crateSize / 2));
}

// Moves a falling crate one step and lands it on the first comet it touches. If it ever drifts out of the world area,
// or is still falling after longestFallSeconds (looping round without touching down), it's set down on the comet
// nearest to it instead, so it can always be reached.
const longestFallSeconds = 10;
function fall(crate, stepSeconds, comets, crateSize, world) {
  crate.velocity = add(crate.velocity, scale(gravityAt(crate.position, comets), stepSeconds));
  crate.position = add(crate.position, scale(crate.velocity, stepSeconds));
  crate.secondsFalling = (crate.secondsFalling ?? 0) + stepSeconds;
  const outsideWorld = crate.position.x < 0 || crate.position.y < 0 || crate.position.x > world.widthMetres || crate.position.y > world.heightMetres;
  const touchedIndex = comets.findIndex((comet) => distance(comet.centre, crate.position) <= comet.radius + crateSize / 2);
  if (touchedIndex < 0 && !outsideWorld && crate.secondsFalling < longestFallSeconds) return;
  const cometIndex = touchedIndex >= 0 ? touchedIndex
    : comets.reduce((nearest, comet, index) => (distance(comet.centre, crate.position) < distance(comets[nearest].centre, crate.position) ? index : nearest), 0);
  const offset = normalize(subtract(crate.position, comets[cometIndex].centre));
  restOnComet(crate, comets, cometIndex, Math.atan2(offset.y, offset.x), crateSize);
}

// Moves falling loot crates, ages loot crates, and spawns an ordinary crate when due. The spawn timer only runs while
// there's room for another ordinary crate.
export function updateCrates(spawner, stepSeconds, comets, crateSettings, random, world) {
  for (const crate of spawner.crates) {
    if (crate.falling) fall(crate, stepSeconds, comets, crateSettings.size, world);
    if (crate.secondsRemaining !== null) crate.secondsRemaining -= stepSeconds;
  }
  spawner.crates = spawner.crates.filter((crate) => crate.secondsRemaining === null || crate.secondsRemaining > 0);

  const ordinaryCrateCount = spawner.crates.filter((crate) => !crate.isLoot).length;
  if (ordinaryCrateCount >= crateSettings.maximumCratesAtOnce) return;
  spawner.secondsUntilNextSpawn -= stepSeconds;
  if (spawner.secondsUntilNextSpawn > 0) return;
  spawner.secondsUntilNextSpawn = crateSettings.spawnIntervalSeconds;
  const crate = {
    isLoot: false,
    weaponNames: [pickOne(crateSettings.weaponsInside, random)],
    secondsRemaining: null,
  };
  const cometIndex = Math.floor(random() * comets.length);
  restOnComet(crate, comets, cometIndex, random() * 2 * Math.PI, crateSettings.size);
  spawner.crates.push(crate);
}

export function dropLootCrate(spawner, position, droneSettings, random) {
  spawner.crates.push({
    isLoot: true,
    falling: true,
    velocity: { x: 0, y: 0 },
    cometIndex: null,
    angleOnComet: 0,
    position: { ...position },
    // The special weapon is given last, so it ends up selected.
    weaponNames: [pickOne(droneSettings.lootBonusWeapons, random), droneSettings.lootSpecialWeapon],
    secondsRemaining: droneSettings.lootLifetimeSeconds,
  });
}

// Removes every crate the character touches and returns them.
export function collectTouchedCrates(spawner, character, crateSettings) {
  const touchDistance = character.bodyRadius + crateSettings.size / 2;
  const collected = spawner.crates.filter((crate) => distance(crate.position, character.position) <= touchDistance);
  spawner.crates = spawner.crates.filter((crate) => !collected.includes(crate));
  return collected;
}
