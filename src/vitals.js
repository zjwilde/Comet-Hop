// Health, lives and respawn timing for any character (player or drone). The same rules apply to everyone.
// A character's "state" is one of: 'alive', 'waitingToRespawn', 'eliminated' (out of lives, gone for good).

export function createVitals(rules) {
  return {
    health: rules.maxHealth,
    livesRemaining: rules.startingLives,
    state: 'alive',
    secondsUntilRespawn: 0,
    protectionSecondsRemaining: 0,
  };
}

export function isAlive(vitals) {
  return vitals.state === 'alive';
}

export function canBeHurt(vitals) {
  return isAlive(vitals) && vitals.protectionSecondsRemaining <= 0;
}

// Returns true if this damage cost the character a life.
export function applyDamage(vitals, damageAmount, rules) {
  if (!canBeHurt(vitals)) return false;
  vitals.health = Math.max(0, vitals.health - damageAmount);
  if (vitals.health > 0) return false;
  loseLife(vitals, rules);
  return true;
}

// Used both for running out of health and for leaving the world. Respawn protection does not prevent this.
export function loseLife(vitals, rules) {
  if (!isAlive(vitals)) return;
  vitals.health = 0;
  vitals.livesRemaining -= 1;
  if (vitals.livesRemaining > 0) {
    vitals.state = 'waitingToRespawn';
    vitals.secondsUntilRespawn = rules.respawnDelaySeconds;
  } else {
    vitals.state = 'eliminated';
  }
}

// Counts down timers. Returns true on the one step where the character comes back and must be placed in the world.
export function updateVitals(vitals, stepSeconds, rules) {
  if (isAlive(vitals)) {
    vitals.protectionSecondsRemaining = Math.max(0, vitals.protectionSecondsRemaining - stepSeconds);
    return false;
  }
  if (vitals.state !== 'waitingToRespawn') return false;
  vitals.secondsUntilRespawn -= stepSeconds;
  if (vitals.secondsUntilRespawn > 0) return false;
  vitals.state = 'alive';
  vitals.health = rules.maxHealth;
  vitals.secondsUntilRespawn = 0;
  vitals.protectionSecondsRemaining = rules.respawnProtectionSeconds;
  return true;
}
