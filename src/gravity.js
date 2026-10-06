// Comet gravity, computed directly each time it's needed (no lookup table): comets don't move and there are only a
// few, so summing every comet's pull is cheap and exact.

// "Gravitational strength" is the usual gravitational constant times the comet's mass, folded into one number.
// Choosing it from the pull felt at the surface keeps the settings in terms a player notices.
export function gravitationalStrengthForSurfaceGravity(surfaceGravity, radius) {
  return surfaceGravity * radius * radius;
}

export function createComets(cometLayout, surfaceGravity) {
  return cometLayout.map((layoutEntry) => ({
    centre: { ...layoutEntry.centre },
    radius: layoutEntry.radius,
    gravitationalStrength: gravitationalStrengthForSurfaceGravity(surfaceGravity, layoutEntry.radius),
  }));
}

// Acceleration at a point: the sum over comets of strength x (centre - point) / distance^3.
export function gravityAt(point, comets) {
  let accelerationX = 0;
  let accelerationY = 0;
  for (const comet of comets) {
    const offsetX = comet.centre.x - point.x;
    const offsetY = comet.centre.y - point.y;
    const distanceSquared = offsetX * offsetX + offsetY * offsetY;
    if (distanceSquared === 0) continue;
    const strengthOverDistanceCubed = comet.gravitationalStrength / (distanceSquared * Math.sqrt(distanceSquared));
    accelerationX += offsetX * strengthOverDistanceCubed;
    accelerationY += offsetY * strengthOverDistanceCubed;
  }
  return { x: accelerationX, y: accelerationY };
}
