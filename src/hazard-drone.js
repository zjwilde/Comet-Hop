// The hazard drone: a neutral drone that, on top of flying around, fires a ring of shots in every direction at a
// fixed interval, and drops a loot crate (which falls onto a comet) wherever it loses a life.
import { directionFromAngle } from './vector.js';
import { Drone } from './drone.js';
import { createProjectile } from './projectiles.js';
import { dropLootCrate } from './crates.js';

export class HazardDrone extends Drone {
  constructor(id, droneSettings, rules) {
    super(id, droneSettings, rules);
    this.secondsUntilVolley = droneSettings.secondsBetweenVolleys;
    this.volleysFired = 0;
  }

  update(game, stepSeconds) {
    super.update(game, stepSeconds);
    for (const direction of this.takeVolleyDirections(stepSeconds)) {
      const { volleyShot } = this.settings;
      game.projectiles.push(createProjectile(this, direction, volleyShot, volleyShot.projectileSpeed, game.settings.rules.shotsCanHurtTheirShooter));
    }
  }

  // Counts down to the next volley. Returns the directions to fire in on this step (none if it isn't time yet).
  // Each volley is turned half a gap from the last, so standing in a gap doesn't stay safe.
  takeVolleyDirections(stepSeconds) {
    this.secondsUntilVolley -= stepSeconds;
    if (this.secondsUntilVolley > 0) return [];
    this.secondsUntilVolley = this.settings.secondsBetweenVolleys;
    this.volleysFired += 1;
    const gapRadians = (2 * Math.PI) / this.settings.shotsPerVolley;
    const turnRadians = (this.volleysFired % 2) * (gapRadians / 2);
    return Array.from({ length: this.settings.shotsPerVolley }, (_, shotIndex) => directionFromAngle(turnRadians + shotIndex * gapRadians));
  }

  // Comes back with a full wait before its next volley.
  respawn(game) {
    super.respawn(game);
    this.secondsUntilVolley = this.settings.secondsBetweenVolleys;
  }

  onLostLife(game) {
    dropLootCrate(game.crateSpawner, this.position, this.settings, game.random);
  }
}
