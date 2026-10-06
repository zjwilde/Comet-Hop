// The bot difficulty slider: 0 is the easiest bot, 1 the hardest. Each setting below moves in a straight line between
// its easiest and hardest value. (The fixed values in settings.js, used by the tests, match a difficulty of about 0.7.)
export const difficultyRange = {
  reactionSeconds: { easiest: 0.7, hardest: 0.15 },
  aimWobbleDegrees: { easiest: 18, hardest: 3 },
  powerWobbleFraction: { easiest: 0.28, hardest: 0.06 },
  correctionFraction: { easiest: 0.3, hardest: 0.75 },
};

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
  botSettings.difficulty = clampedDifficulty;
}

export function difficultyName(difficulty) {
  if (difficulty < 1 / 3) return 'Easy';
  if (difficulty < 2 / 3) return 'Normal';
  return 'Hard';
}
