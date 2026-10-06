// Controllers decide a fighter's controls each physics step. Any fighter can have any controller: the human player
// and the bot differ only in this. (A remote online player would later be one more kind of controller.)
// Every controller has decideControls(game, fighter, stepSeconds), returning
// { runDirection, jumpRequested, fireHeld, aimPoint, switchWeaponRequested }. The bot's controller is in bot.js.

// Standing still, aiming at itself (which never fires).
export function idleControls(fighter) {
  return { runDirection: 0, jumpRequested: false, fireHeld: false, aimPoint: { ...fighter.position }, switchWeaponRequested: false };
}

// Takes its controls from a source, such as the keyboard and mouse.
export class HumanController {
  constructor(readControls) {
    this.readControls = readControls;
  }

  decideControls() {
    return this.readControls();
  }
}

// Does nothing at all. Used for a player with no input attached, and in tests.
export class IdleController {
  decideControls(game, fighter) {
    return idleControls(fighter);
  }
}
