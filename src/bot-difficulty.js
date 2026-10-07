// The bot difficulty slider: 0 is the easiest bot, 1 the hardest. Each setting below moves in a straight line between
// its easiest and hardest value. (The fixed values in settings.js, used by the tests, match a difficulty of about 0.7.)
export const difficultyRange = {
  reactionSeconds: { easiest: 0.7, hardest: 0.15 },
  aimWobbleDegrees: { easiest: 18, hardest: 3 },
  powerWobbleFraction: { easiest: 0.28, hardest: 0.06 },
  correctionFraction: { easiest: 0.3, hardest: 0.75 },
  // Pickier with drills the harder it is: a drill must come out closer to its target, and land-timing must be tighter.
  drillExitAllowanceMetres: { easiest: 2.5, hardest: 0.5 },
  landingDrillTimingSeconds: { easiest: 0.2, hardest: 0.06 },
  // How long a hidden target must have stood still before it drills through a comet at them.
  drillTargetStillSeconds: { easiest: 0, hardest: 0.8 },
};

// From this difficulty it checks the aim path before drilling; from the next, it keeps drills only for clean shots.
export const checksDrillAimPathFromDifficulty = 0.5;
export const drillsOnlyForCleanShotsFromDifficulty = 2 / 3;

// Below this difficulty the bot doesn't bother saving limited ammo for good moments; it fires it at the first chance.
export const savesLimitedAmmoFromDifficulty = 0.35;

export const defaultDifficulty = 0.5;

// Sets the bot's settings for a difficulty between 0 and 1.
export function applyBotDifficulty(botSettings, difficulty) {
  const clampedDifficulty = Math.min(1, Math.max(0, difficulty));
  for (const [settingName, { easiest, hardest }] of Object.entries(difficultyRange)) {
    // Blended this way round so each end of the slider gives its value exactly.
    botSettings[settingName] = easiest * (1 - clampedDifficulty) + hardest * clampedDifficulty;
  }
  botSettings.savesLimitedAmmo = clampedDifficulty >= savesLimitedAmmoFromDifficulty;
  botSettings.checksDrillAimPath = clampedDifficulty >= checksDrillAimPathFromDifficulty;
  botSettings.drillsOnlyForCleanShots = clampedDifficulty >= drillsOnlyForCleanShotsFromDifficulty;
  botSettings.difficulty = clampedDifficulty;
}

export function difficultyName(difficulty) {
  if (difficulty < 1 / 3) return 'Easy';
  if (difficulty < 2 / 3) return 'Normal';
  return 'Hard';
}
