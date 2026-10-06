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
// Inside a comet (only a drill gets there) the pull instead shrinks steadily to zero at the centre, as it would inside
// a solid ball; this matches the outside formula exactly at the surface.
export function gravityAt(point, comets) {
  let accelerationX = 0;
  let accelerationY = 0;
  for (const comet of comets) {
    const offsetX = comet.centre.x - point.x;
    const offsetY = comet.centre.y - point.y;
    const distanceFromCentre = Math.hypot(offsetX, offsetY);
    if (distanceFromCentre === 0) continue;
    // Using the radius in place of the distance when inside gives the steady shrink towards the centre.
    const pullPerMetreOfOffset = comet.gravitationalStrength / Math.max(distanceFromCentre, comet.radius) ** 3;
    accelerationX += offsetX * pullPerMetreOfOffset;
    accelerationY += offsetY * pullPerMetreOfOffset;
  }
  return { x: accelerationX, y: accelerationY };
}
