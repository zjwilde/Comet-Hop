# Comet Hop (working title): instructions for Claude

Read this file first. It is the handoff between sessions: what the game is, what the user decided, what's built, what's
still open, and how this user likes to work. The idea began in the sibling project "Overarching Game"; this project is
standalone and nothing here should be built to fit that project's rules unless asked.

## The game, in plain words

A 2D real-time game: small comets float in space, each pulling things toward itself with its own gravity. Fighters run
around the comet they stand on, jump between comets, and aim and fire weapons whose shots bend under gravity, all at
once (not turn-based). Inspiration: the flash game *Gravitee Wars* (small planets, gravity-bent shots), but real time
and closer to a platformer than to turn-based artillery. Online multiplayer is the long-term goal; for now it's the
player against a bot.

## Controls

- **A / Left arrow:** run counterclockwise. **D / Right arrow:** run clockwise. **W / Up arrow:** jump. (Both key sets
  work because the user plays on a touchpad; bindings are one table at the top of `src/input.js`.)
- **Mouse:** aim. Distance from your fighter sets the power of weapons with adjustable power. **Click:** fire.
- **Tab** or **/** (next to the arrows): switch weapon. **R:** restart.
- **Bot difficulty slider** (top centre, 0 to 1, default 0.5 "Normal", remembered per browser).
- Touchpad-friendly: right-click / two-finger tap is blocked (it opened the browser menu, swallowing the next tap); a
  ring flashes at the crosshair for every press. A press during cooldown does nothing: the user rejected remembering
  it and firing automatically when ready.

## Decisions made with the user (all 2026-10-06)

- **Opponent:** a bot with exactly the player's abilities and controls (a Fighter with a different controller).
  Same-keyboard two-player is out: mouse aiming favours whoever has the mouse.
- **The bot plays like a person:** only what a player can see plus rules of thumb, never calculating where shots go.
  An earlier version that simulated shots was superhuman and froze while its shots flew; both were rejected.
- **The drone** stays as a neutral hazard (maybe a turret or guard in a level later): ring volleys at intervals, loot
  when destroyed, never runs out of lives, doesn't count towards winning.
- **Weapons:** variety is the fun; expect many more. The starting Blaster never runs out but is weak; collected weapons
  are stronger and ammo-limited. A curving weapon shows a **limited** aim path (length needs playtest tuning).
- **The Barrage is meant to be ridiculous:** don't balance it down (its 1.5 s cooldown being shorter than the Mortar's
  is fine). Using it well means a full inventory and a power that lands several weapons at once.
- **Self-damage is on** (`rules.shotsCanHurtTheirShooter`), as in Gravitee Wars and tank games. Friendly fire between
  teammates will be its own setting once teams exist.
- **Health and lives:** conventional; limited lives (a setting), same for every fighter; leaving the map costs a life.
- **Code structure:** object-oriented. `Character` base class; the player and bot are both `Fighter`s with different
  controllers; drones subclass `Drone`.

## What's built

Plain ES modules in `src/`, no dependencies. `npm start` serves http://localhost:8080/ (also saves match logs, below);
`npm test` runs ~110 tests in about a second. All tunable numbers are in `src/settings.js`.

**Physics** (`gravity.js`, `fighter.js`): gravity summed directly over comets each step (inside a comet it shrinks
linearly to zero at the centre, for drills). Grounded fighters are an angle around a comet; running speed divided by
radius gives angular speed. Jumps launch radially and keep running speed; airborne movement is semi-implicit; landing
snaps to whichever comet is touched while closing in. `predictLanding` uses the same steps (tested to match exactly).

**Characters:** `character.js` (base: health, lives, hits; subclasses supply `update`, `receiveKnockback`, `respawn`,
optional `onLostLife`). `fighter.js` (movement, weapons, crates). `controllers.js` (`HumanController`,
`IdleController`), `bot.js` (`BotController`). `drone.js` (`Drone`) and `hazard-drone.js` (`HazardDrone`: volleys, loot).

**Weapons** (data in `settings.js`, behaviour flags in `projectiles.js`; likely to become classes when there are more):
- Blaster: unlimited, fixed speed, weak. Heavy Cannon: fixed speed, hits hard.
- Volcano Bomb: lob; bursts on impact or as soon as it passes within 1.2 m of anyone but its shooter, throwing about
  two thirds of its 9 fragments in a narrow fan at the nearest such character (never into the ground). This is the
  user's redesign, because the original didn't work against dodging.
- Drill: lob; bores into the first comet it meets and detonates coming out of the far side (1.8 m blast fading to the
  edge); can't hit anyone while underground.
- Mortar: slow lob (2.5 to 8 m/s, sped up once by request), 3.5 m blast on impact with a comet or character.
- Barrage: drone loot; each of 4 shots fires every carried weapon at once, using only its own ammo.
- Crates on comet surfaces hold one crate weapon. The drone's loot crate falls under gravity onto a comet (always
  reachable; can be grabbed mid-fall) and holds a bonus weapon plus the Barrage.
- The aim path uses the game's own physics step; a test checks it matches real flight exactly.

**The bot** (`bot.js`; its header comment lists every habit). In short:
- Aims at where it saw its target a reaction time ago, with wobble. Lobs start from a rough guess and learn from where
  each one came down, one lob at a time.
- Has a rough feel for each weapon's reach (lobs: speed squared over gravity) and won't fire out of reach.
- Rules of thumb: no explosives within their blast reach; lobs only from solid ground; never sets off or jumps while
  its own lob is in the air; steps back from where its explosive lob is headed; dodges bursting shots.
- Saves limited ammo for good moments (target airborne, nearly dead, standing still, or already ranged in; easy close
  straight shot; or itself low on health).
- Drills: kept for a target hidden behind a comet it can bore through, and for the spot where an airborne enemy is
  about to land. Pickier the harder it is: aim-path check, hidden target must stand still, Hard keeps drills only for
  clean shots.
- Movement: fetches loot crates; flanks a hidden target via a vantage point on another comet (routes avoid the
  target's comet) instead of walking into an ambush; varies hop take-off spot (within 15 degrees) and timing (up to
  0.5 s). Routes are fewest hops; it commits to a route until its next decision moment.
- Takes passing Blaster shots at the drone only when it has no shot at its enemy; never changes course or spends ammo
  for it (user's direction).
- Difficulty (`bot-difficulty.js`): reaction time, aim and power wobble, miss correction, drill pickiness and landing
  timing move between easiest and hardest; Easy doesn't save ammo. The fixed values in `settings.js` (used by tests)
  sit at about 0.7.

**Playtest tools:**
- Match log (`match-log.js`): every shot fired, where each main shot came down relative to the nearest enemy, every
  hit, every life lost with unused ammo. The game posts it to the local server every 10 s, at match end and on
  restart; it lands in `playtest-logs/` (git-ignored, accepted only from this computer). Read those files to see
  how a playtest went.
- In the browser console: `cometHop.game`, `cometHop.summary()`, `cometHop.earlierMatchSummaries()`.

## Open questions and next steps

- **No-flank fallback (asked, unanswered):** on this map only 4 of 16 neighbouring comet pairs have a flanking route,
  so the bot usually still approaches a hidden enemy's comet. Options offered: wait for the enemy to show (with a time
  limit), keep moving on landing, leave it, or change the map for more open sight lines.
- **Tuning by play:** every weapon number, bot number, the aim path length (0.8 s) and the volcano fuse (1.2 m, two
  thirds aimed, 40 degree fan) are first guesses.
- **Choices made while building, not yet confirmed by the user:** collected weapons are lost on death; respawn is on
  top of a random comet no other fighter stands on; all comets share one surface gravity; comets are never damaged; a
  drill that hits someone before reaching any comet does plain hit damage; the Blaster and Heavy Cannon show no aim
  path (they barely curve).
- **Later:** more weapons (then weapons as classes); the bot's targeting for more than two fighters (who to shoot,
  where to stand); online multiplayer (a remote player would be one more controller).
- The user's playtest feedback so far: the Hard bot is now a real challenge; the drill ambush from the far side of a
  comet is no longer broken; trackpad aiming makes things harder for them.

## Testing

- `node --test` over `tests/*.test.js`; about a second for everything. Bot tests run whole simulated matches with a
  seeded random (`tests/helpers.js`), so a change to the random sequence can change how a match plays out. Prefer
  tests that check a rule ("never fires the mortar within its own blast reach") over one exact course of events.
- `tests/layout-reachability.test.js`: a standing jump within 15 degrees of facing a neighbour lands on it, and a
  standing jump never leaves the map. Change the comet layout and jump numbers together and rerun it.
- The user's habit: for anything meant as a guarantee, break it on purpose in a scratch copy (the scratchpad folder)
  and confirm a test fails. This caught several weak tests this session.

## Working here (Windows, Git Bash)

- In `sed`, a backslash-backtick is a start-of-line anchor, not a literal backtick: never use it to "unescape"
  template strings (it once put a backtick at the start of every line of a test file).
- In a quoted heredoc (`<<'EOF'`), write template literals with plain backticks and `${...}`, not escaped ones.
- Multi-line edits: a small Node script with exact find-and-replace pairs that fails loudly when a pair isn't found
  has worked well; keep each script in the scratchpad.
- The browser pane runs the game only while it's visible on screen; when hidden it barely advances. The preview
  server must be restarted after changing `scripts/serve.js`.

## Stack

Plain ES modules, Canvas 2D, a tiny static file server (`scripts/serve.js`), `node --test`, no dependencies and no build
step, like the user's other two browser games ("First Game", "Overarching Game").

## How this user likes to work

- **Plain words first**, with any name defined where it first appears; no single-letter names.
- **Descriptive names everywhere** (variables, settings, test names).
- **Ask before making a design decision**; give a recommendation with trade-offs; keep questions few and concrete.
  They often answer mid-task with short messages that refine or redirect; follow the latest one.
- **Guarantees by construction where cheap**, but this is a small, fast-moving project.
- **Testing discipline**, proportionate to what exists (see Testing above).
- **Watch context and tokens:** small, targeted edits; short command output; suggest a fresh session at a natural
  checkpoint.
- **Honest reporting:** say plainly what is and isn't built or tested, and label guesses as guesses.
- Only make a change when it's worth doing (they said so about test-management tooling: no extra machinery for
  problems they don't have yet).
