// Shared test helpers.

// A repeatable stand-in for Math.random, so tests that involve randomness always see the same sequence.
export function createSeededRandom(seed) {
  let state = seed >>> 0;
  return function seededRandom() {
    state = (state + 0x6d2b79f5) >>> 0;
    let mixed = state;
    mixed = Math.imul(mixed ^ (mixed >>> 15), mixed | 1);
    mixed ^= mixed + Math.imul(mixed ^ (mixed >>> 7), mixed | 61);
    return ((mixed ^ (mixed >>> 14)) >>> 0) / 4294967296;
  };
}

// A deep copy of the real settings, so a test can change numbers without affecting other tests.
export async function copyOfSettings() {
  const { settings } = await import('../src/settings.js');
  return structuredClone(settings);
}

export const noControls = { runDirection: 0, jumpRequested: false, fireHeld: false, aimPoint: { x: 0, y: 0 }, switchWeaponRequested: false };
