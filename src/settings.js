// Every tunable number in one place. Distances are in metres, times in seconds, speeds in metres per second.
// These are first guesses, not tuned by playing yet. The comet layout and jump numbers are checked together by
// tests/layout-reachability.test.js, so change them together.

export const settings = {
  world: {
    widthMetres: 48,
    heightMetres: 27,
    // A player who drifts this far past the screen edge loses a life (like falling off the stage).
    outOfBoundsMarginMetres: 4,
  },

  physics: {
    stepsPerSecond: 120,
    // Pull felt standing on any comet's surface. Bigger comets still reach further, because pull fades with distance
    // from the centre, and a bigger comet's surface is further from its centre.
    cometSurfaceGravity: 9,
  },

  // Comet centres and radii, in metres. Static: comets never move.
  cometLayout: [
    { centre: { x: 8, y: 11 }, radius: 2.2 },
    { centre: { x: 13.5, y: 18 }, radius: 2.6 },
    { centre: { x: 19, y: 10 }, radius: 1.8 },
    { centre: { x: 24, y: 17.5 }, radius: 2.4 },
    { centre: { x: 29, y: 10 }, radius: 2.2 },
    { centre: { x: 34.5, y: 18 }, radius: 2.8 },
    { centre: { x: 40, y: 11 }, radius: 2.0 },
  ],

  player: {
    bodyRadius: 0.4,
    runSpeed: 3,
    jumpLaunchSpeed: 4.5,
  },

  // Health, lives and respawning. The same rules apply to every character, the player and the target drone alike.
  rules: {
    maxHealth: 100,
    startingLives: 3,
    respawnDelaySeconds: 2,
    // After respawning, a character cannot be hurt or pushed for this long.
    respawnProtectionSeconds: 1.5,
  },

  drone: {
    bodyRadius: 0.6,
    cruiseSpeed: 4,
    arrivalDistance: 0.2,
    // How far from any comet's surface a waypoint, and the straight path to it, must stay.
    clearanceFromComets: 0.8,
    // Knockback on the drone fades out at roughly this fraction per second.
    knockbackFadePerSecond: 3,
  },

  crates: {
    spawnIntervalSeconds: 8,
    maximumCratesAtOnce: 1,
    size: 0.7,
    weaponInside: 'heavyCannon',
  },

  weapons: {
    // The starting weapon: never runs out, so a player can always attack, but weak and short-ranged.
    blaster: {
      displayName: 'Blaster',
      projectileColour: '#ffe066',
      cooldownSeconds: 0.3,
      projectileSpeed: 14,
      projectileLifetimeSeconds: 0.7,
      projectileRadius: 0.1,
      damage: 8,
      knockbackSpeed: 1,
      // 1 means shots bend under comet gravity exactly as a thrown object would; 0 means they fly straight.
      gravityScale: 1,
      ammoPerPickup: null,
    },
    // Found in crates: slower to fire, hits much harder and further, limited ammo.
    heavyCannon: {
      displayName: 'Heavy Cannon',
      projectileColour: '#ff8c42',
      cooldownSeconds: 0.9,
      projectileSpeed: 17,
      projectileLifetimeSeconds: 2.5,
      projectileRadius: 0.18,
      damage: 30,
      knockbackSpeed: 6,
      gravityScale: 1,
      ammoPerPickup: 5,
    },
  },
};
