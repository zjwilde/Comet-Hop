// Weapon crates: appear on a random spot on a random comet's surface every so often; touching one collects it.
import { add, scale, distance, directionFromAngle } from './vector.js';

export function createCrateSpawner(crateSettings) {
  return { crates: [], secondsUntilNextSpawn: crateSettings.spawnIntervalSeconds };
}

// The spawn timer only runs while there's room for another crate.
export function updateCrateSpawner(spawner, stepSeconds, comets, crateSettings, random) {
  if (spawner.crates.length >= crateSettings.maximumCratesAtOnce) return;
  spawner.secondsUntilNextSpawn -= stepSeconds;
  if (spawner.secondsUntilNextSpawn > 0) return;
  spawner.secondsUntilNextSpawn = crateSettings.spawnIntervalSeconds;
  const comet = comets[Math.floor(random() * comets.length)];
  const angleOnComet = random() * 2 * Math.PI;
  spawner.crates.push({
    angleOnComet,
    position: add(comet.centre, scale(directionFromAngle(angleOnComet), comet.radius + crateSettings.size / 2)),
  });
}

// Removes every crate the character touches and returns how many that was.
export function collectTouchedCrates(spawner, character, crateSettings) {
  const touchDistance = character.bodyRadius + crateSettings.size / 2;
  const before = spawner.crates.length;
  spawner.crates = spawner.crates.filter((crate) => distance(crate.position, character.position) > touchDistance);
  return before - spawner.crates.length;
}
