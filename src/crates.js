// Weapon crates. Ordinary crates appear on a random spot on a random comet's surface every so often. Loot crates are
// dropped by the drone where it dies: they float in space, hold the special weapon plus a bonus weapon, and vanish if
// not collected in time.
// Touching any crate collects it.
import { add, scale, distance, directionFromAngle } from './vector.js';

export function createCrateSpawner(crateSettings) {
  return { crates: [], secondsUntilNextSpawn: crateSettings.spawnIntervalSeconds };
}

function pickOne(choices, random) {
  return choices[Math.floor(random() * choices.length)];
}

// Ages loot crates, and spawns an ordinary crate when due. The spawn timer only runs while there's room for another
// ordinary crate.
export function updateCrates(spawner, stepSeconds, comets, crateSettings, random) {
  for (const crate of spawner.crates) {
    if (crate.secondsRemaining !== null) crate.secondsRemaining -= stepSeconds;
  }
  spawner.crates = spawner.crates.filter((crate) => crate.secondsRemaining === null || crate.secondsRemaining > 0);

  const ordinaryCrateCount = spawner.crates.filter((crate) => !crate.floating).length;
  if (ordinaryCrateCount >= crateSettings.maximumCratesAtOnce) return;
  spawner.secondsUntilNextSpawn -= stepSeconds;
  if (spawner.secondsUntilNextSpawn > 0) return;
  spawner.secondsUntilNextSpawn = crateSettings.spawnIntervalSeconds;
  const cometIndex = Math.floor(random() * comets.length);
  const comet = comets[cometIndex];
  const angleOnComet = random() * 2 * Math.PI;
  spawner.crates.push({
    floating: false,
    cometIndex,
    angleOnComet,
    position: add(comet.centre, scale(directionFromAngle(angleOnComet), comet.radius + crateSettings.size / 2)),
    weaponNames: [pickOne(crateSettings.weaponsInside, random)],
    secondsRemaining: null,
  });
}

export function dropLootCrate(spawner, position, droneSettings, random) {
  spawner.crates.push({
    floating: true,
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
