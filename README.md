# Comet Hop

A 2D real-time arcade shooter set among small comets, each with its own gravity. You run around the comet you're
standing on, jump from one comet to the next, and fire weapons whose shots bend under gravity, all while a bot does the
same to you. It's inspired by the flash game *Gravitee Wars*, but it plays in real time and is closer to a platformer
than to turn-based artillery.

It's an early work in progress: one map, one bot opponent, and a handful of weapons. Online multiplayer is the
long-term goal.

## [Play it in your browser](https://zjwilde.github.io/Comet-Hop/)

Nothing to download or install. It needs a keyboard and a mouse or touchpad.

## How to play

| Action | Keys |
| --- | --- |
| Run counterclockwise / clockwise | **A** / **D** or **Left** / **Right** arrow |
| Jump | **W** or **Up** arrow |
| Aim | Mouse (for lobbed weapons, distance from your fighter sets the power) |
| Fire | Click |
| Switch weapon | **Tab** or **/** |
| Restart | **R** |

Every fighter starts with 3 lives. You lose a life when your health runs out or when you fly off the edge of the map.
The last fighter with lives left wins. Your own shots can hurt you.

The slider at the top of the screen sets how hard the bot is, from easy to hard. The game remembers your choice.

### Weapons

- **Blaster:** your starting weapon. It never runs out of ammo, but it's weak.
- **Heavy Cannon:** a fast shot that hits hard.
- **Volcano Bomb:** a lob that bursts near its target and sprays fragments at the nearest fighter.
- **Drill:** a lob that bores through the first comet it hits and explodes as it comes out the far side.
- **Mortar:** a slow lob with a big blast.
- **Barrage:** fires every weapon you're carrying at once. Deliberately ridiculous.

All weapons except the Blaster have limited ammo. Pick them up by running into the crates on comet surfaces. A neutral
drone also floats around firing rings of shots at everyone. Destroy it and it drops a crate holding the Barrage plus a
bonus weapon.

## Development

The game is plain JavaScript modules drawn on an HTML canvas, with no dependencies and no build step.

To run your own copy, you need [Node.js](https://nodejs.org/) 22 or newer. In a terminal in the project folder, run
`npm start`, then open http://localhost:8080/ and leave the terminal open while you play. (Opening `index.html`
straight from disk doesn't work: browsers won't load the game's module files that way.) To stop the server, press
**Ctrl+C**. To use a different port, set the `PORT` environment variable.

- `src/`: the game. All the numbers you might want to tune are in `src/settings.js`.
- `tests/`: run them with `npm test`.
- `scripts/serve.js`: the local server. When you play through it, it also saves a log of each match to
  `playtest-logs/`.

## Licence

GPL-3.0. See [LICENSE](LICENSE).
