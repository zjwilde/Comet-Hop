// Small helpers for 2D points and directions, stored as plain { x, y } objects. The screen's y axis points down.

export function add(first, second) {
  return { x: first.x + second.x, y: first.y + second.y };
}

export function subtract(first, second) {
  return { x: first.x - second.x, y: first.y - second.y };
}

export function scale(vector, factor) {
  return { x: vector.x * factor, y: vector.y * factor };
}

export function dot(first, second) {
  return first.x * second.x + first.y * second.y;
}

export function length(vector) {
  return Math.hypot(vector.x, vector.y);
}

export function distance(first, second) {
  return Math.hypot(first.x - second.x, first.y - second.y);
}

// Returns a zero vector for a zero-length input rather than dividing by zero.
export function normalize(vector) {
  const vectorLength = length(vector);
  return vectorLength === 0 ? { x: 0, y: 0 } : scale(vector, 1 / vectorLength);
}

// Unit direction at an angle in radians. Because y points down, increasing the angle turns clockwise on screen.
export function directionFromAngle(angle) {
  return { x: Math.cos(angle), y: Math.sin(angle) };
}

// Shortest distance from a point to the straight segment between segmentStart and segmentEnd.
export function distanceFromPointToSegment(point, segmentStart, segmentEnd) {
  const segment = subtract(segmentEnd, segmentStart);
  const segmentLengthSquared = dot(segment, segment);
  if (segmentLengthSquared === 0) return distance(point, segmentStart);
  const fractionAlong = Math.min(1, Math.max(0, dot(subtract(point, segmentStart), segment) / segmentLengthSquared));
  return distance(point, add(segmentStart, scale(segment, fractionAlong)));
}
