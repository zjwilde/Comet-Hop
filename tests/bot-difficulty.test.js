import { test } from 'node:test';
import assert from 'node:assert/strict';
import { applyBotDifficulty, difficultyName, difficultyRange, savesLimitedAmmoFromDifficulty } from '../src/bot-difficulty.js';
import { copyOfSettings } from './helpers.js';

test('a harder bot reacts faster, wobbles less, and corrects more after a miss', () => {
  const easier = {};
  const harder = {};
  applyBotDifficulty(easier, 0.2);
  applyBotDifficulty(harder, 0.8);
  assert.ok(harder.reactionSeconds < easier.reactionSeconds);
  assert.ok(harder.aimWobbleDegrees < easier.aimWobbleDegrees);
  assert.ok(harder.powerWobbleFraction < easier.powerWobbleFraction);
  assert.ok(harder.correctionFraction > easier.correctionFraction);
});

test('the ends of the slider give exactly the easiest and hardest values, and it never goes past them', () => {
  const easiest = {};
  const hardest = {};
  applyBotDifficulty(easiest, -5);
  applyBotDifficulty(hardest, 5);
  for (const [settingName, range] of Object.entries(difficultyRange)) {
    assert.equal(easiest[settingName], range.easiest);
    assert.equal(hardest[settingName], range.hardest);
  }
});

test('only an easy bot stops saving limited ammo', () => {
  const botSettings = {};
  applyBotDifficulty(botSettings, savesLimitedAmmoFromDifficulty - 0.01);
  assert.equal(botSettings.savesLimitedAmmo, false);
  applyBotDifficulty(botSettings, savesLimitedAmmoFromDifficulty);
  assert.equal(botSettings.savesLimitedAmmo, true);
});

test('the fixed bot settings the tests use sit at about 0.7 on the slider', async () => {
  const { bot } = await copyOfSettings();
  const atSeventyPercent = {};
  applyBotDifficulty(atSeventyPercent, 0.7);
  for (const settingName of Object.keys(difficultyRange)) {
    assert.ok(Math.abs(atSeventyPercent[settingName] - bot[settingName]) <= Math.abs(bot[settingName]) * 0.1, settingName);
  }
});

test('the slider is labelled Easy, Normal or Hard', () => {
  assert.deepEqual([0, 0.5, 1].map(difficultyName), ['Easy', 'Normal', 'Hard']);
});
