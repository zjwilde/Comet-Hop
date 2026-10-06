// A record of what happened in a match, for checking how fighters (especially the bot) spend their shots: every shot
// fired, where each main shot came down relative to the nearest enemy, every hit, and every life lost (with any
// limited-ammo shots the loser was still carrying, which are lost with that life).

// Old entries are dropped beyond this, so a very long session can't use unlimited memory.
const mostEntriesKept = 20000;

export function logEvent(game, event) {
  game.matchLog.push({ seconds: Number(game.elapsedSeconds.toFixed(2)), ...event });
  if (game.matchLog.length > mostEntriesKept) game.matchLog.shift();
}

// A landing counts as useful if it came down within this distance of an enemy (body edge included): close enough for
// a blast or burst to matter. Anything further away is a miss.
export const usefulLandingMetres = 3;

// Per fighter: limited-ammo shots fired by weapon, how many of their landings were useful, damage dealt, and how many
// limited-ammo shots were still unused when each life was lost.
export function summarizeMatchLog(matchLog) {
  const summary = {};
  const fighterSummary = (fighterId) => {
    summary[fighterId] ??= { limitedShotsFired: {}, limitedLandings: 0, limitedLandingsUseful: 0, damageDealt: 0, livesLost: [] };
    return summary[fighterId];
  };
  for (const event of matchLog) {
    if (event.type === 'fired' && event.limitedAmmo) {
      const fired = fighterSummary(event.fighterId).limitedShotsFired;
      fired[event.weaponName] = (fired[event.weaponName] ?? 0) + 1;
    }
    if (event.type === 'landed' && event.limitedAmmo && event.ownerId !== 'drone') {
      const owner = fighterSummary(event.ownerId);
      owner.limitedLandings += 1;
      if (event.distanceToNearestEnemy <= usefulLandingMetres) owner.limitedLandingsUseful += 1;
    }
    if (event.type === 'hit' && event.fromId !== 'drone') fighterSummary(event.fromId).damageDealt += event.damage;
    if (event.type === 'lostLife' && event.limitedAmmoCarried) {
      fighterSummary(event.characterId).livesLost.push({ atSeconds: event.seconds, unusedLimitedShots: event.limitedAmmoCarried });
    }
  }
  for (const fighter of Object.values(summary)) fighter.damageDealt = Math.round(fighter.damageDealt);
  return summary;
}
