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

- **Left arrow:** run counterclockwise around the comet currently stood on.
- **Right arrow:** run clockwise around the comet currently stood on.
- **Up:** jump (leaves the surface).
- **Mouse position:** aim direction, independent of movement.
- **Left mouse button:** fire the current weapon.
- **Tab:** switch weapon. **R:** restart.

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

## Decisions made with the user (2026-10-06)

- **Opponents:** start single-player against a target-practice drone (floats freely, ignores gravity, flies to random
  waypoints). **Online multiplayer is the long-term goal** and where the game is meant to be most fun. Same-keyboard
  two-player is not planned: mouse aiming unfairly favours whoever has the mouse.
- **Starting weapon:** never uses ammo, so nobody is ever unable to attack, but deliberately weak and generic (less
  damage, range, knockback). Collectible weapons from crates are stronger and limited by ammo.
- **Health, damage, respawning:** conventional. Lives are limited (a setting) and the same rules apply to every
  character. Leaving the map (past a margin) costs a life, like falling off the stage.

## What's built (prototype)

Plain ES modules in `src/`, all tunable numbers in `src/settings.js`. `npm start` serves at http://localhost:8080/,
`npm test` runs the tests. Running, jumping, gravity, landing; blaster (unlimited) and heavy cannon (from crates, 5
shots); shots bend under gravity, stop at comets, never hit their shooter; health, lives, respawn with brief
protection; the drone; HUD.

Choices made while building, not yet confirmed by the user: shots bend under gravity (`gravityScale` per weapon);
collected weapons are lost on death; respawn is on top of a random comet; all comets share one surface gravity.

**Feel numbers:** gravity 9, jump 4.5, run 3 and the 7-comet layout were picked by simulating jumps, not by playing.
`tests/layout-reachability.test.js` checks that a jump aimed within 15 degrees of a neighbouring comet lands on it,
and that a standing jump never leaves the map. Change layout and jump numbers together and rerun it.

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
