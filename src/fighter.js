// A fighter: the human player and the bot alike. Runs around the comet it stands on, jumps off, falls under the summed
// gravity of all comets, lands on whichever comet it reaches, carries weapons and picks up crates. What it does each
// step is decided by its controller (keyboard and mouse, or the bot), so every fighter has exactly the same abilities.
import { add, scale, subtract, dot, length, normalize, directionFromAngle } from './vector.js';
import { gravityAt } from './gravity.js';
import { Character } from './character.js';
import { createArsenal, updateArsenalCooldown, selectNextWeapon, tryFire, giveWeapon, weaponsThatFire, selectedWeapon } from './weapons.js';
import { createProjectile, isInsideBounds, muzzleSpeedFor } from './projectiles.js';
import { collectTouchedCrates } from './crates.js';
import { logEvent } from './match-log.js';

export class Fighter extends Character {
  // controller: anything with decideControls(game, fighter, stepSeconds); see controllers.js and bot.js.
  constructor(id, controller, fighterSettings, rules) {
    super(id, fighterSettings.bodyRadius, rules);
    this.controller = controller;
    // Where it last aimed, in world metres (for drawing).
    this.aimPoint = { x: 0, y: 0 };
    // 'grounded' (standing on a comet, position set by the angle around it) or 'airborne' (moved by gravity).
    this.movementMode = 'airborne';
    this.groundedCometIndex = null;
    this.angleOnComet = 0;
    this.arsenal = createArsenal();
    // How long ago the fire button was last pressed (for the on-screen confirmation that a press registered).
    this.secondsSinceFirePress = Infinity;
  }

  update(game, stepSeconds) {
    const { settings } = game;
    const controls = this.controller.decideControls(game, this, stepSeconds);
    this.aimPoint = controls.aimPoint;
    if (controls.switchWeaponRequested) selectNextWeapon(this.arsenal);
    this.updateMovement(controls, stepSeconds, game.comets, settings.fighter);
    updateArsenalCooldown(this.arsenal, stepSeconds);
    this.secondsSinceFirePress = controls.firePressed ? 0 : this.secondsSinceFirePress + stepSeconds;
    // A press fires only if the weapon is ready right then; a press during cooldown does nothing.
    if (controls.fireHeld || controls.firePressed) this.fireTowards(game, controls.aimPoint);
    for (const crate of collectTouchedCrates(game.crateSpawner, this, settings.crates)) {
      for (const weaponName of crate.weaponNames) giveWeapon(this.arsenal, weaponName, settings.weapons);
    }
    if (!isInsideBounds(this.position, game.outerBounds)) this.loseLife(game);
  }

  // controls.runDirection: +1 runs clockwise (D or right arrow), -1 counterclockwise (A or left arrow), 0 stands still.
  // controls.jumpRequested: true on the step the jump key was pressed.
  updateMovement(controls, stepSeconds, comets, fighterSettings) {
    if (this.movementMode === 'grounded') {
      const comet = comets[this.groundedCometIndex];
      // A running speed in metres per second becomes an angular speed by dividing by the comet's radius, so a bigger
      // comet takes proportionally longer to run around.
      const angularSpeed = (controls.runDirection * fighterSettings.runSpeed) / comet.radius;
      this.angleOnComet = wrapAngle(this.angleOnComet + angularSpeed * stepSeconds);
      const outward = directionFromAngle(this.angleOnComet);
      const distanceFromCentre = comet.radius + this.bodyRadius;
      this.position = add(comet.centre, scale(outward, distanceFromCentre));
      // The running velocity is tracked even while grounded, so a jump carries it into the arc.
      const clockwiseTangent = { x: -outward.y, y: outward.x };
      this.velocity = scale(clockwiseTangent, angularSpeed * distanceFromCentre);
      if (controls.jumpRequested) this.launchIntoAir(scale(outward, fighterSettings.jumpLaunchSpeed));
      return;
    }

    // Airborne: semi-implicit step (acceleration, then velocity, then position). No air control.
    this.velocity = add(this.velocity, scale(gravityAt(this.position, comets), stepSeconds));
    this.position = add(this.position, scale(this.velocity, stepSeconds));
    this.landIfTouchingComet(comets);
  }

  placeOnComet(comets, cometIndex, angleOnComet) {
    const comet = comets[cometIndex];
    this.movementMode = 'grounded';
    this.groundedCometIndex = cometIndex;
    this.angleOnComet = angleOnComet;
    this.position = add(comet.centre, scale(directionFromAngle(angleOnComet), comet.radius + this.bodyRadius));
    this.velocity = { x: 0, y: 0 };
  }

  // Leaves the ground (if grounded) and adds a velocity change. Used by jumping and by being knocked back.
  launchIntoAir(velocityChange) {
    this.movementMode = 'airborne';
    this.groundedCometIndex = null;
    this.velocity = add(this.velocity, velocityChange);
  }

  // Lands on a comet when touching its surface while moving towards its centre. Returns true if it landed.
  landIfTouchingComet(comets) {
    for (let cometIndex = 0; cometIndex < comets.length; cometIndex += 1) {
      const comet = comets[cometIndex];
      const offsetFromCentre = subtract(this.position, comet.centre);
      const closingIn = dot(this.velocity, offsetFromCentre) < 0;
      if (length(offsetFromCentre) <= comet.radius + this.bodyRadius && closingIn) {
        this.placeOnComet(comets, cometIndex, Math.atan2(offsetFromCentre.y, offsetFromCentre.x));
        return true;
      }
    }
    return false;
  }

  receiveKnockback(knockbackVelocity) {
    this.launchIntoAir(knockbackVelocity);
  }

  // Collected weapons are lost with the life, so the log notes any limited-ammo shots that went unused.
  onLostLife(game) {
    const limitedAmmoCarried = this.arsenal.carriedWeapons.reduce((total, carried) => total + (carried.ammoRemaining ?? 0), 0);
    logEvent(game, { type: 'lostLife', characterId: this.id, limitedAmmoCarried });
  }

  // On top of a random comet that no other fighter is standing on, carrying only the starting weapon.
  respawn(game) {
    const occupiedCometIndexes = game.fighters
      .filter((other) => other !== this && other.isAlive() && other.movementMode === 'grounded')
      .map((other) => other.groundedCometIndex);
    const allCometIndexes = game.comets.map((_, cometIndex) => cometIndex);
    const freeCometIndexes = allCometIndexes.filter((cometIndex) => !occupiedCometIndexes.includes(cometIndex));
    const choices = freeCometIndexes.length > 0 ? freeCometIndexes : allCometIndexes;
    this.placeOnComet(game.comets, choices[Math.floor(game.random() * choices.length)], -Math.PI / 2);
    this.arsenal = createArsenal();
  }

  // The aim point sets the direction, and (for weapons with adjustable power) its distance sets the speed.
  // Only the selected weapon's ammo is used, even when it fires several weapons at once. Returns true if it fired.
  fireTowards(game, aimPoint) {
    const { weapons, aiming } = game.settings;
    const aimOffset = subtract(aimPoint, this.position);
    if (length(aimOffset) === 0) return false;
    // Worked out before firing, since firing a weapon's last shot drops it.
    const firingWeaponNames = weaponsThatFire(this.arsenal, weapons);
    const firedWith = selectedWeapon(this.arsenal);
    const limitedAmmo = firedWith.ammoRemaining !== null;
    if (!tryFire(this.arsenal, weapons)) return false;
    for (const weaponName of firingWeaponNames) {
      const muzzleSpeed = muzzleSpeedFor(weapons[weaponName], length(aimOffset), aiming);
      const projectile = createProjectile(this, normalize(aimOffset), weapons[weaponName], muzzleSpeed, game.settings.rules.shotsCanHurtTheirShooter);
      // For the match log: which weapon, and whether it cost limited ammo (every shot of a Barrage does).
      projectile.weaponName = weaponName;
      projectile.limitedAmmo = limitedAmmo;
      game.projectiles.push(projectile);
    }
    logEvent(game, { type: 'fired', fighterId: this.id, weaponName: firedWith.weaponName, limitedAmmo });
    return true;
  }
}

function wrapAngle(angle) {
  const fullTurn = 2 * Math.PI;
  return ((angle % fullTurn) + fullTurn) % fullTurn;
}

// Where and when an airborne fighter will land if nothing changes (no knockback): follows its fall for up to
// lookAheadSeconds with the same steps and landing rule as real movement. Returns { cometIndex, position, seconds },
// or null if it won't land that soon (or isn't in the air).
export function predictLanding(fighter, comets, stepSeconds, lookAheadSeconds) {
  if (fighter.movementMode !== 'airborne') return null;
  let position = { ...fighter.position };
  let velocity = { ...fighter.velocity };
  for (let step = 1; step * stepSeconds <= lookAheadSeconds + 1e-9; step += 1) {
    velocity = add(velocity, scale(gravityAt(position, comets), stepSeconds));
    position = add(position, scale(velocity, stepSeconds));
    const cometIndex = comets.findIndex((comet) => {
      const offsetFromCentre = subtract(position, comet.centre);
      return length(offsetFromCentre) <= comet.radius + fighter.bodyRadius && dot(velocity, offsetFromCentre) < 0;
    });
    if (cometIndex >= 0) return { cometIndex, position, seconds: step * stepSeconds };
  }
  return null;
}
