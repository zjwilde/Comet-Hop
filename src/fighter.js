// Fighter movement (the human player and the bot alike): running around the comet you stand on, jumping off it,
// falling under the summed gravity of all comets, and landing on whichever comet you reach.
import { add, scale, subtract, dot, length, directionFromAngle } from './vector.js';
import { gravityAt } from './gravity.js';
import { createVitals } from './vitals.js';
import { createArsenal } from './weapons.js';

// controlledBy: 'human' (keyboard and mouse) or 'bot' (computer).
export function createFighter(id, controlledBy, fighterSettings, rules) {
  return {
    id,
    kind: 'fighter',
    controlledBy,
    rules,
    bodyRadius: fighterSettings.bodyRadius,
    position: { x: 0, y: 0 },
    velocity: { x: 0, y: 0 },
    // Where it last aimed, in world metres (for drawing).
    aimPoint: { x: 0, y: 0 },
    // 'grounded' (standing on a comet, position set by the angle around it) or 'airborne' (moved by gravity).
    movementMode: 'airborne',
    groundedCometIndex: null,
    angleOnComet: 0,
    vitals: createVitals(rules),
    arsenal: createArsenal(),
  };
}

export function placeOnComet(fighter, comets, cometIndex, angleOnComet) {
  const comet = comets[cometIndex];
  fighter.movementMode = 'grounded';
  fighter.groundedCometIndex = cometIndex;
  fighter.angleOnComet = angleOnComet;
  fighter.position = add(comet.centre, scale(directionFromAngle(angleOnComet), comet.radius + fighter.bodyRadius));
  fighter.velocity = { x: 0, y: 0 };
}

// Leaves the ground (if grounded) and adds a velocity change. Used by jumping and by being knocked back.
export function launchIntoAir(fighter, velocityChange) {
  fighter.movementMode = 'airborne';
  fighter.groundedCometIndex = null;
  fighter.velocity = add(fighter.velocity, velocityChange);
}

// controls.runDirection: +1 runs clockwise (right arrow), -1 counterclockwise (left arrow), 0 stands still.
// controls.jumpRequested: true on the step the jump key was pressed.
export function updateFighterMovement(fighter, controls, stepSeconds, comets, fighterSettings) {
  if (fighter.movementMode === 'grounded') {
    const comet = comets[fighter.groundedCometIndex];
    // A running speed in metres per second becomes an angular speed by dividing by the comet's radius, so a bigger
    // comet takes proportionally longer to run around.
    const angularSpeed = (controls.runDirection * fighterSettings.runSpeed) / comet.radius;
    fighter.angleOnComet = wrapAngle(fighter.angleOnComet + angularSpeed * stepSeconds);
    const outward = directionFromAngle(fighter.angleOnComet);
    const distanceFromCentre = comet.radius + fighter.bodyRadius;
    fighter.position = add(comet.centre, scale(outward, distanceFromCentre));
    // The running velocity is tracked even while grounded, so a jump carries it into the arc.
    const clockwiseTangent = { x: -outward.y, y: outward.x };
    fighter.velocity = scale(clockwiseTangent, angularSpeed * distanceFromCentre);
    if (controls.jumpRequested) launchIntoAir(fighter, scale(outward, fighterSettings.jumpLaunchSpeed));
    return;
  }

  // Airborne: semi-implicit step (acceleration, then velocity, then position). No air control.
  fighter.velocity = add(fighter.velocity, scale(gravityAt(fighter.position, comets), stepSeconds));
  fighter.position = add(fighter.position, scale(fighter.velocity, stepSeconds));
  landIfTouchingComet(fighter, comets);
}

// Lands on a comet when touching its surface while moving towards its centre. Returns true if it landed.
export function landIfTouchingComet(fighter, comets) {
  for (let cometIndex = 0; cometIndex < comets.length; cometIndex += 1) {
    const comet = comets[cometIndex];
    const offsetFromCentre = subtract(fighter.position, comet.centre);
    const closingIn = dot(fighter.velocity, offsetFromCentre) < 0;
    if (length(offsetFromCentre) <= comet.radius + fighter.bodyRadius && closingIn) {
      placeOnComet(fighter, comets, cometIndex, Math.atan2(offsetFromCentre.y, offsetFromCentre.x));
      return true;
    }
  }
  return false;
}

function wrapAngle(angle) {
  const fullTurn = 2 * Math.PI;
  return ((angle % fullTurn) + fullTurn) % fullTurn;
}
