# Comet Hop (working title): instructions for Claude

A first playable prototype exists (see "What's built" below). This file began as a handoff from the conversation where the idea was designed, in the sibling project
"Overarching Game" (while brainstorming a possible future 3D dimension there). It is standalone for now; it might later
inform or be adapted into an Overarching Game dimension, but nothing here should be built to fit that project's rules
(clusters, doors, the travel-time guarantee) unless asked. Read this file first.

## The game, in plain words

A 2D, real-time (not turn-based) game: a handful of small comets float in space, each pulling things toward itself with
its own gravity. Players run around the surface of whichever comet they're standing on and jump between comets, aiming
and firing weapons at each other in real time, all players moving at once (not taking turns).

**Direct inspiration:** the flash game *Gravitee Wars* (small planets, gravity-bent shots, cute astronauts) — but that
game is turn-based artillery (aim an angle and power, then wait); this game is real time with the player directly
controlling movement and jumping, closer to a platformer than to artillery. Also informed by *Oddworld: Abe's
Oddysee/Exoddus* (hand-built puzzle thinking, not directly applicable to this real-time combat idea) and the Overarching
Game's existing "abilities as moves with limits" approach to player movement.

## Controls (decided)

- **A:** run counterclockwise around the comet currently stood on.
- **D:** run clockwise around the comet currently stood on.
- **W:** jump (leaves the surface).
- The arrow keys (Left, Right, Up) do the same as A, D, W. (Arrows first, then W/A/D only, then both, all on
  2026-10-06; both are wanted because of touchpad play. Bindings live in one table at the top of `src/input.js`.)
- **Mouse position:** aim direction, independent of movement.
- **Left mouse button:** fire the current weapon.
- **Tab** or **/** (next to the arrow keys): switch weapon. **R:** restart.
- **Touchpad-friendly (the user currently plays on a touchpad, 2026-10-06):** right-click / two-finger tap is blocked
  (it opened the browser menu, swallowing the next tap); a ring flashes at the crosshair whenever a press registers. A
  press during cooldown does nothing: the user rejected remembering it and firing automatically when ready.

## Physics plan (discussed, not yet built)

- **Gravity is computed directly, not from a precomputed lookup table.** For a point P and comets each with a centre and
  mass: `g(P) = sum over comets of G x mass x (centre - P) / |centre - P|^3`. Comets are static (do not move), so this
  sum is cheap and exact to compute on demand every physics step. A grid of precomputed values was considered and
  rejected: it would need to be very fine near small comets (where gravity changes fastest) to stay accurate, which costs
  a lot of memory for little benefit over just doing the sum. Only reconsider a lookup table, or a smarter method such as
  Barnes-Hut grouping, if the number of gravity-emitting bodies grows into the hundreds.
- **Grounded movement** (standing on a comet): position is an angle around that comet's centre, at the comet's radius
  plus the player's height. Running changes the angle. Convert a running speed in metres per second into angular speed
  by dividing by the comet's radius, so a bigger comet takes proportionally longer to walk all the way around (matches
  how the Overarching Game's platformer already treats speed, just wrapped around a circle).
- **Jump:** leaves the surface radially outward (straight away from the comet's centre) at a tunable launch speed,
  carrying the player's current running (tangential) velocity into the resulting arc.
- **Airborne:** integrate the player's velocity each physics step using the full summed gravity field above (the same
  semi-implicit approach the Overarching Game's `PlatformerPlayer` uses for falling: compute acceleration, update
  velocity, update position). No air control planned for this MVP — once you've jumped, gravity decides the rest.
- **Landing:** when the player's distance to some comet's centre reaches about that comet's radius plus player height
  while closing in on it, snap back to "grounded" on that comet, with the new angle computed from the touch point.
- **Jump reach and comet spacing have to be tuned together** so that a normal jump comfortably clears the gap to a
  neighbouring comet — the user explicitly does not want this to require frame-perfect timing. Not tuned yet; this is a
  build-and-feel step, the numbers are guesses until tried.

## Weapons and combat (discussed, not yet built)

- Weapons have a cooldown between shots. Possibly limited ammo, refilled by crates that spawn somewhere in the world —
  not finalized whether the first weapon uses ammo at all.
- Plan for at least two placeholder weapons for the MVP, simple and different only in their numbers (cooldown, ammo,
  projectile speed), so the weapon-switch key has something to do. Not an exhaustive weapon system yet.
- **Health, damage, death/respawn, and any win condition are not decided.** They depend entirely on the open question
  below — a pure movement/shooting prototype may not need them yet at all.

## Decisions made with the user

- **Opponents (2026-10-06):** single-player against a **bot that has every ability the player has** (same controls,
  same rules), in a different colour, with a rudimentary AI. **Online multiplayer is the long-term goal.** Same-keyboard
  two-player is not planned: mouse aiming unfairly favours whoever has the mouse.
- **The drone stays** as a neutral hazard (maybe later a turret or guard in a level): it fires a ring of shots in every
  direction at a fixed interval, and drops special loot when destroyed. It never runs out of lives and doesn't count
  towards winning.
- **Weapons:** variety is what makes the game fun; expect many more. The starting weapon never uses ammo (nobody is
  ever unable to attack) but is weak and generic. Collected weapons are stronger and limited by ammo. Inspirations: the
  Gravitee Wars drill, the "volcano bomb" found in most tank games.
- **Curving shots:** a weapon whose shots visibly curve shows the aiming player an aim path, **limited** to the start of
  the flight (length needs playtest tuning). For weapons that have a muzzle velocity, **mouse distance from the
  fighter sets the power.**
- **Special loot (placeholder):** the Barrage: 4 shots, each firing every weapon carried at once, using only the
  Barrage's ammo. Comes with a random ammo-limited weapon so it's never weak. **It is meant to be ridiculous** (user, 2026-10-06):
  don't balance it down. Its own 1.5 s cooldown is shorter than the Mortar's, and that's fine. The skill is in using
  it with a full inventory and picking a power that lands several weapons on target at once.
- **Self-damage is on (2026-10-06)**, as in Gravitee Wars and tank games: your own shots, fragments and blasts can
  hurt you. It's a rule setting (`shotsCanHurtTheirShooter`) so it can be switched off. Friendly fire between
  teammates will be its own setting once teams exist.
- **Health, damage, respawning:** conventional. Lives are limited (a setting) and the same for every fighter. Leaving
  the map (past a margin) costs a life, like falling off the stage.

## What's built (prototype)

Plain ES modules in `src/`, all tunable numbers in `src/settings.js`. `npm start` serves at http://localhost:8080/,
`npm test` runs the tests. `window.cometHop.game` in the browser console exposes the live game for poking.

- **Class structure (decided with the user, 2026-10-06):** `Character` (`character.js`) is the base for everything
  that can be shot: shared position, health, lives and how a hit lands; each subclass supplies `update`,
  `receiveKnockback` and `respawn` (and optionally `onLostLife`).
  - `Fighter` (`fighter.js`): running, jumping, gravity, landing, weapons, crates. **The player and the bot are both
    Fighters with different controllers**, not different classes. A controller has `decideControls(game, fighter,
    stepSeconds)`: `HumanController` and `IdleController` in `controllers.js`, `BotController` in `bot.js`. A remote
    online player would be another controller.
  - `Drone` (`drone.js`): free flight between waypoints. Each kind of drone subclasses it: `HazardDrone`
    (`hazard-drone.js`) adds ring volleys and loot. Future turrets or guards go alongside it.
- Bot (`BotController`), **meant to play like a person (user's direction, 2026-10-06)**: it uses only what a player
  can see plus rules of thumb, never a calculation of where shots will go (an earlier version that simulated shots was
  superhuman and froze while its shots flew; both rejected). Straight weapons: aims where it saw the target a reaction
  time ago, with wobble, fires in range with a clear line of sight. Lobs: rough first guess, then learns from where each
  lob came down, one lob at a time like an artillery player. Rules of thumb: no explosives at point-blank range, never
  lob into its own feet, runs from bursting shots coming down near it, chases a target it can't shoot. Each weapon
  has a rough "feel" for reach (lobs: speed squared over gravity) and isn't fired out of reach. Lobs only from solid
  ground; it doesn't chase while watching its own lob, and steps back from where an explosive lob is headed. (These
  fixed frequent mortar self-hits the user reported: nearly 30% of shots, now about 2%.) It saves limited ammo like a person (user's point,
  2026-10-06): pokes with the Blaster, and spends limited-ammo shots only at good moments (target airborne, nearly
  dead, standing still, or already ranged in; an easy close straight shot; or the bot itself low on health). Difficulty
  lives in a few plain settings (reaction, wobble, correction) under `bot` in `src/settings.js`.
- Weapons are still plain settings data with behaviour flags (`passesThroughComets`, `eruption`,
  `firesAllCarriedWeapons`); likely to become classes once there are many more.
- Weapons: Blaster (unlimited, fixed speed), Heavy Cannon (fixed speed), Volcano Bomb (adjustable power, erupts into
  fragments), Drill (adjustable power; bores into the first comet it meets and detonates on coming out of the far surface, with a blast that fades from centre to edge), Mortar (user's request: slow muzzle speed, big blast; detonates on impact with a comet or a character, 3.5 m blast), Barrage (drone loot). Crates on comet surfaces hold one
  crate weapon; the drone's floating loot crate holds a bonus weapon plus the Barrage.
- The aim path uses the same physics step as real shots, and a test checks they match exactly.

Choices made while building, not yet confirmed by the user: collected weapons are lost on death; respawn is on top of
a random comet no other fighter stands on; all comets share one surface gravity; comets are never damaged; a drill that hits someone before reaching any comet does plain hit damage with no blast; a drill underground can't hit anyone; blast numbers (radius 1.8 m, 35 damage at the centre) are guesses; the starting weapons
curve only slightly, so they show no aim path.

**Feel numbers:** gravity 9, jump 4.5, run 3 and the 7-comet layout were picked by simulating jumps, not by playing.
`tests/layout-reachability.test.js` checks that a jump aimed within 15 degrees of a neighbouring comet lands on it,
and that a standing jump never leaves the map. Change layout and jump numbers together and rerun it. Every weapon and
bot number is a first guess.

## Stack (recommended; matches the user's other two browser games)

Plain ES modules, Canvas 2D rendering, a tiny static file server (the Overarching Game's `scripts/serve.js` is a short,
reusable example), `node --test` for tests, no dependencies. Both "First Game" and "Overarching Game" are built this way;
there's no reason to introduce a framework or a build step for this.

## How this user likes to work (carried over; ask if anything here seems not to fit this project)

- **Plain words first**, with any name defined where it first appears; no single-letter names.
- **Descriptive names everywhere** — variables, settings, test names — so their purpose is clear without having to ask.
- **Ask before making a design decision**, rather than quietly picking one and building on it; give a recommendation
  with trade-offs and keep questions few and concrete.
- **Guarantees by construction where that's cheap**, but this is a much smaller, faster-moving project than the
  Overarching Game — don't force that project's heavier process onto a first prototype.
- **Testing discipline**, proportionate to what exists: once there is real logic (the gravity math, the grounded/airborne
  transition), write tests alongside it, and for anything that's meant to be a guarantee, break it on purpose in a
  scratch copy to confirm a test catches it.
- **Watch context and tokens**: small, targeted edits; short command output; suggest a fresh session at a natural
  checkpoint (this very file exists because of that habit).
- **Honest reporting**: say plainly what is and is not built or tested yet. The feel numbers in the physics plan above
  are guesses and should be labelled as such until actually played.
