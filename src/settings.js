// Every tunable number in one place. Distances are in metres, times in seconds, speeds in metres per second.
// These are first guesses, not tuned by playing yet. The comet layout and jump numbers are checked together by
// tests/layout-reachability.test.js, so change them together.

export const settings = {
  world: {
    widthMetres: 48,
    heightMetres: 27,
    // A fighter who drifts this far past the screen edge loses a life (like falling off the stage).
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

  // Movement shared by every fighter: the human player and the bot have exactly the same abilities.
  fighter: {
    bodyRadius: 0.4,
    runSpeed: 3,
    jumpLaunchSpeed: 4.5,
  },

  // Health, lives and respawning. The same rules apply to every fighter.
  rules: {
    maxHealth: 100,
    startingLives: 3,
    respawnDelaySeconds: 2,
    // After respawning, a character cannot be hurt or pushed for this long.
    respawnProtectionSeconds: 1.5,
    // Self-damage: whether your own shots, fragments and blasts can hurt you, as in Gravitee Wars and tank games.
    // (Once there are teams, whether teammates can hurt each other, usually called friendly fire, will be a separate
    // setting.)
    shotsCanHurtTheirShooter: true,
  },

  aiming: {
    // For weapons whose power you choose: the mouse this far from your fighter, or further, means full power.
    mouseDistanceForFullPower: 8,
    // How much of a curving shot's predicted path is drawn while aiming. Needs playtest tuning.
    aimPathPreviewSeconds: 0.8,
  },

  // The computer-controlled fighter. It plays by the same rules and controls as the human player.
  bot: {
    // How often it changes its mind about running and jumping: a random time between these two.
    shortestDecisionSeconds: 0.6,
    longestDecisionSeconds: 1.8,
    chanceToJumpPerDecision: 0.3,
    chanceToStandStillPerDecision: 0.25,
    // When it has no good shot, how likely it is (per decision) to hop to a neighbouring comet closer to its target,
    // and how big a gap between comet surfaces it treats as hoppable (matches tests/layout-reachability.test.js).
    chanceToHopTowardsTargetPerDecision: 0.6,
    longestHopGapMetres: 5.6,
    // How often it re-plans its shot, and how wrong its aim can be.
    aimReplanSeconds: 0.35,
    aimErrorDegrees: 5,
    muzzleSpeedErrorFraction: 0.08,
    // It only fires when its planned shot passes at least this close to its target.
    fireWhenShotPassesWithinMetres: 1.2,
    // How hard it searches for a shot: directions and power levels tried, and how far ahead each is followed.
    aimDirectionsToTry: 36,
    muzzleSpeedsToTry: 5,
    shotPredictionSeconds: 2.5,
  },

  // The floating drone: a neutral hazard. It shoots a ring of shots in every direction now and then, can be shot by
  // anyone, and drops a special floating loot crate when destroyed. It never runs out of lives and doesn't count
  // towards winning.
  drone: {
    includeInMatch: true,
    // Waits longer than a fighter before coming back, so its loot stays special.
    respawnDelaySeconds: 12,
    secondsBetweenVolleys: 3,
    shotsPerVolley: 8,
    // Its shots use the same fields as a weapon (see weapons below).
    volleyShot: {
      projectileColour: '#ff6b4a',
      projectileShape: 'ball',
      projectileSpeed: 6,
      projectileLifetimeSeconds: 3,
      projectileRadius: 0.12,
      damage: 6,
      knockbackSpeed: 1.5,
      gravityScale: 1,
      passesThroughComets: false,
      eruption: null,
    },
    // The loot crate floats where the drone died and vanishes if not collected in time. It holds the special weapon
    // plus one of the bonus weapons, chosen at random, so the special weapon always has something strong to fire.
    lootSpecialWeapon: 'barrage',
    lootBonusWeapons: ['heavyCannon', 'volcanoBomb', 'drill'],
    lootLifetimeSeconds: 20,
    bodyRadius: 0.6,
    cruiseSpeed: 4,
    arrivalDistance: 0.2,
    // How far from any comet's surface a waypoint, and the straight path to it, must stay.
    clearanceFromComets: 0.8,
    // Knockback on the drone fades out at roughly this fraction per second.
    knockbackFadePerSecond: 3,
  },

  crates: {
    spawnIntervalSeconds: 7,
    maximumCratesAtOnce: 2,
    size: 0.7,
    // Each crate holds one of these, chosen at random.
    weaponsInside: ['heavyCannon', 'volcanoBomb', 'drill'],
  },

  // Each weapon either has a fixed projectileSpeed, or a muzzleSpeedRange whose speed is chosen by how far the mouse
  // is from the fighter. gravityScale 1 means shots bend under comet gravity like a thrown object; 0 means straight.
  // ammoPerPickup null means unlimited.
  weapons: {
    // The starting weapon: never runs out, so a fighter can always attack, but weak and short-ranged.
    blaster: {
      displayName: 'Blaster',
      projectileColour: '#ffe066',
      projectileShape: 'ball',
      cooldownSeconds: 0.3,
      projectileSpeed: 14,
      projectileLifetimeSeconds: 0.7,
      projectileRadius: 0.1,
      damage: 8,
      knockbackSpeed: 1,
      gravityScale: 1,
      ammoPerPickup: null,
      passesThroughComets: false,
      showsAimPath: false,
      eruption: null,
    },
    // Fast, nearly straight, hits hard.
    heavyCannon: {
      displayName: 'Heavy Cannon',
      projectileColour: '#ff8c42',
      projectileShape: 'ball',
      cooldownSeconds: 0.9,
      projectileSpeed: 17,
      projectileLifetimeSeconds: 2.5,
      projectileRadius: 0.18,
      damage: 30,
      knockbackSpeed: 6,
      gravityScale: 1,
      ammoPerPickup: 5,
      passesThroughComets: false,
      showsAimPath: false,
      eruption: null,
    },
    // A lobbed shell that bursts into a fan of burning fragments where it lands.
    volcanoBomb: {
      displayName: 'Volcano Bomb',
      projectileColour: '#ff5a36',
      projectileShape: 'ball',
      cooldownSeconds: 1.2,
      muzzleSpeedRange: { slowest: 3, fastest: 11 },
      projectileLifetimeSeconds: 6,
      projectileRadius: 0.22,
      damage: 12,
      knockbackSpeed: 3,
      gravityScale: 1,
      ammoPerPickup: 3,
      passesThroughComets: false,
      showsAimPath: true,
      eruption: {
        fragmentCount: 9,
        // The fragments fan out across this angle, centred on straight up from the surface hit.
        spreadDegrees: 110,
        slowestFragmentSpeed: 3,
        fastestFragmentSpeed: 6.5,
        fragmentDamage: 7,
        fragmentRadius: 0.09,
        fragmentLifetimeSeconds: 4,
        fragmentKnockbackSpeed: 1.5,
        fragmentColour: '#ffb03a',
      },
    },
    // Bores into the first comet it meets and detonates on coming out of the far side, so you can hit someone standing
    // on the other side of a comet.
    drill: {
      displayName: 'Drill',
      projectileColour: '#c9d1e0',
      projectileShape: 'drill',
      cooldownSeconds: 1,
      muzzleSpeedRange: { slowest: 4, fastest: 13 },
      projectileLifetimeSeconds: 3.5,
      projectileRadius: 0.14,
      damage: 25,
      knockbackSpeed: 4,
      gravityScale: 1,
      ammoPerPickup: 3,
      passesThroughComets: true,
      showsAimPath: true,
      eruption: null,
      // Damage and knockback are full at the blast centre and fade to nothing at blastRadius (measured to the nearest
      // edge of a character's body). The shooter is never hurt.
      detonation: {
        blastRadius: 1.8,
        damageAtCentre: 35,
        knockbackSpeedAtCentre: 6,
        flashColour: '#fff4c2',
      },
    },
    // Special loot from the drone: each shot fires every other weapon carried at once, using only the Barrage's own
    // ammo. It has no projectile of its own.
    barrage: {
      displayName: 'Barrage',
      firesAllCarriedWeapons: true,
      projectileColour: '#e9a8ff',
      cooldownSeconds: 1.5,
      ammoPerPickup: 4,
    },
  },
};
