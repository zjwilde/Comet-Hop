// Player movement: running around the comet you stand on, jumping off it, falling under the summed gravity of all
// comets, and landing on whichever comet you reach.
import { add, scale, subtract, dot, length, directionFromAngle } from './vector.js';
import { gravityAt } from './gravity.js';
import { createVitals } from './vitals.js';
import { createArsenal } from './weapons.js';

export function createPlayer(id, playerSettings, rules) {
  return {
    id,
    kind: 'player',
    bodyRadius: playerSettings.bodyRadius,
    position: { x: 0, y: 0 },
    velocity: { x: 0, y: 0 },
    // 'grounded' (standing on a comet, position set by the angle around it) or 'airborne' (moved by gravity).
    movementMode: 'airborne',
    groundedCometIndex: null,
    angleOnComet: 0,
    vitals: createVitals(rules),
    arsenal: createArsenal(),
  };
}

export function placeOnComet(player, comets, cometIndex, angleOnComet) {
  const comet = comets[cometIndex];
  player.movementMode = 'grounded';
  player.groundedCometIndex = cometIndex;
  player.angleOnComet = angleOnComet;
  player.position = add(comet.centre, scale(directionFromAngle(angleOnComet), comet.radius + player.bodyRadius));
  player.velocity = { x: 0, y: 0 };
}

// Leaves the ground (if grounded) and adds a velocity change. Used by jumping and by being knocked back.
export function launchIntoAir(player, velocityChange) {
  player.movementMode = 'airborne';
  player.groundedCometIndex = null;
  player.velocity = add(player.velocity, velocityChange);
}

// controls.runDirection: +1 runs clockwise (right arrow), -1 counterclockwise (left arrow), 0 stands still.
// controls.jumpRequested: true on the step the jump key was pressed.
export function updatePlayerMovement(player, controls, stepSeconds, comets, playerSettings) {
  if (player.movementMode === 'grounded') {
    const comet = comets[player.groundedCometIndex];
    // A running speed in metres per second becomes an angular speed by dividing by the comet's radius, so a bigger
    // comet takes proportionally longer to run around.
    const angularSpeed = (controls.runDirection * playerSettings.runSpeed) / comet.radius;
    player.angleOnComet = wrapAngle(player.angleOnComet + angularSpeed * stepSeconds);
    const outward = directionFromAngle(player.angleOnComet);
    const distanceFromCentre = comet.radius + player.bodyRadius;
    player.position = add(comet.centre, scale(outward, distanceFromCentre));
    // The running velocity is tracked even while grounded, so a jump carries it into the arc.
    const clockwiseTangent = { x: -outward.y, y: outward.x };
    player.velocity = scale(clockwiseTangent, angularSpeed * distanceFromCentre);
    if (controls.jumpRequested) launchIntoAir(player, scale(outward, playerSettings.jumpLaunchSpeed));
    return;
  }

  // Airborne: semi-implicit step (acceleration, then velocity, then position). No air control.
  player.velocity = add(player.velocity, scale(gravityAt(player.position, comets), stepSeconds));
  player.position = add(player.position, scale(player.velocity, stepSeconds));
  landIfTouchingComet(player, comets);
}

// Lands on a comet when touching its surface while moving towards its centre. Returns true if it landed.
export function landIfTouchingComet(player, comets) {
  for (let cometIndex = 0; cometIndex < comets.length; cometIndex += 1) {
    const comet = comets[cometIndex];
    const offsetFromCentre = subtract(player.position, comet.centre);
    const closingIn = dot(player.velocity, offsetFromCentre) < 0;
    if (length(offsetFromCentre) <= comet.radius + player.bodyRadius && closingIn) {
      placeOnComet(player, comets, cometIndex, Math.atan2(offsetFromCentre.y, offsetFromCentre.x));
      return true;
    }
  }
  return false;
}

function wrapAngle(angle) {
  const fullTurn = 2 * Math.PI;
  return ((angle % fullTurn) + fullTurn) % fullTurn;
}
