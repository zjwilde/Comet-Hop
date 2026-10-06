// The base class for everything that can be shot: fighters and drones. It holds what they all share (an id, body
// size, position, velocity, health and lives) and how a hit lands. Each kind of character supplies the rest:
// how it moves each step, how knockback affects it, where it respawns, and (optionally) what happens when it loses a life.
import { createVitals, applyDamage, loseLife, isAlive } from './vitals.js';

export class Character {
  // rules: the health, lives and respawn rules this character follows.
  constructor(id, bodyRadius, rules) {
    this.id = id;
    this.bodyRadius = bodyRadius;
    this.rules = rules;
    this.position = { x: 0, y: 0 };
    this.velocity = { x: 0, y: 0 };
    this.vitals = createVitals(rules);
  }

  isAlive() {
    return isAlive(this.vitals);
  }

  // Damage, then knockback if it survived. Under respawn protection it takes neither. Returns true if it cost a life.
  takeHit(game, damage, knockbackVelocity) {
    const protectedFromHarm = this.vitals.protectionSecondsRemaining > 0;
    const lostLife = applyDamage(this.vitals, damage, this.rules);
    if (lostLife) this.onLostLife(game);
    else if (!protectedFromHarm) this.receiveKnockback(knockbackVelocity);
    return lostLife;
  }

  // Loses a life outright (for example by leaving the map), even under respawn protection.
  loseLife(game) {
    if (!this.isAlive()) return;
    loseLife(this.vitals, this.rules);
    this.onLostLife(game);
  }

  // What happens on losing a life, beyond the usual: nothing, unless a kind of character says otherwise.
  onLostLife(game) {}

  // Every kind of character must supply these three.
  update(game, stepSeconds) {
    throw new Error(`${this.constructor.name} must define update(game, stepSeconds)`);
  }

  receiveKnockback(knockbackVelocity) {
    throw new Error(`${this.constructor.name} must define receiveKnockback(knockbackVelocity)`);
  }

  // Places the character back in the world, at the start of a match and after each respawn wait.
  respawn(game) {
    throw new Error(`${this.constructor.name} must define respawn(game)`);
  }
}
