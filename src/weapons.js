// Which weapons a character carries, which one is selected, ammo, and the cooldown between shots.
// The blaster is always the first weapon carried and has unlimited ammo (ammoRemaining null), so a character can
// never end up unable to attack. Collected weapons are dropped once their ammo runs out.

export const startingWeaponName = 'blaster';

export function createArsenal() {
  return {
    carriedWeapons: [{ weaponName: startingWeaponName, ammoRemaining: null }],
    selectedIndex: 0,
    cooldownSecondsRemaining: 0,
  };
}

export function selectedWeapon(arsenal) {
  return arsenal.carriedWeapons[arsenal.selectedIndex];
}

export function updateArsenalCooldown(arsenal, stepSeconds) {
  arsenal.cooldownSecondsRemaining = Math.max(0, arsenal.cooldownSecondsRemaining - stepSeconds);
}

export function selectNextWeapon(arsenal) {
  arsenal.selectedIndex = (arsenal.selectedIndex + 1) % arsenal.carriedWeapons.length;
}

// Picking up a weapon already carried adds its ammo; a new weapon is added and selected straight away.
export function giveWeapon(arsenal, weaponName, weaponDefinitions) {
  const ammoPerPickup = weaponDefinitions[weaponName].ammoPerPickup;
  const alreadyCarried = arsenal.carriedWeapons.find((carried) => carried.weaponName === weaponName);
  if (alreadyCarried) {
    if (alreadyCarried.ammoRemaining !== null) alreadyCarried.ammoRemaining += ammoPerPickup;
    return;
  }
  arsenal.carriedWeapons.push({ weaponName, ammoRemaining: ammoPerPickup });
  arsenal.selectedIndex = arsenal.carriedWeapons.length - 1;
}

// The weapons whose shots come out when firing: just the selected one, or for a weapon that fires all carried
// weapons (the Barrage), every other weapon carried. Returns weapon names.
export function weaponsThatFire(arsenal, weaponDefinitions) {
  const selectedName = selectedWeapon(arsenal).weaponName;
  if (!weaponDefinitions[selectedName].firesAllCarriedWeapons) return [selectedName];
  return arsenal.carriedWeapons.map((carried) => carried.weaponName).filter((weaponName) => !weaponDefinitions[weaponName].firesAllCarriedWeapons);
}

// Fires the selected weapon if its cooldown has finished. Returns that weapon's definition, or null if it can't fire.
export function tryFire(arsenal, weaponDefinitions) {
  if (arsenal.cooldownSecondsRemaining > 0) return null;
  const carried = selectedWeapon(arsenal);
  const definition = weaponDefinitions[carried.weaponName];
  arsenal.cooldownSecondsRemaining = definition.cooldownSeconds;
  if (carried.ammoRemaining !== null) {
    carried.ammoRemaining -= 1;
    if (carried.ammoRemaining <= 0) {
      arsenal.carriedWeapons.splice(arsenal.selectedIndex, 1);
      arsenal.selectedIndex = 0;
    }
  }
  return definition;
}
