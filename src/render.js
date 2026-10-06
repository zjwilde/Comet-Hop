// Drawing with Canvas 2D. The whole world is always on screen, scaled to fit the window; world units are metres.
import { selectedWeapon } from './weapons.js';
import { isAlive } from './vitals.js';
import { subtract, normalize, directionFromAngle } from './vector.js';
import { gravityAt } from './gravity.js';

const colours = {
  space: '#060914',
  worldArea: '#0b1124',
  star: '#c9d6ff',
  cometInner: '#b9c4d6',
  cometOuter: '#6f7c94',
  crater: 'rgba(40, 48, 66, 0.35)',
  suit: '#eef3fb',
  suitShade: '#aab6c8',
  visor: '#5ad1ff',
  drone: '#ff6b4a',
  droneDark: '#7a2416',
  waypointLine: 'rgba(255, 107, 74, 0.25)',
  crate: '#b07a3c',
  crateEdge: '#5e3c17',
  healthFull: '#5be37d',
  healthLow: '#ff5a5a',
  barBackground: 'rgba(255, 255, 255, 0.15)',
  text: '#e6ecff',
  dimText: 'rgba(230, 236, 255, 0.55)',
};

// pixelsPerMetre and the offset that centres the world in the canvas.
export function createView(canvasWidth, canvasHeight, world) {
  const pixelsPerMetre = Math.min(canvasWidth / world.widthMetres, canvasHeight / world.heightMetres);
  return {
    pixelsPerMetre,
    offsetX: (canvasWidth - world.widthMetres * pixelsPerMetre) / 2,
    offsetY: (canvasHeight - world.heightMetres * pixelsPerMetre) / 2,
    canvasWidth,
    canvasHeight,
  };
}

export function screenToWorld(view, screenPoint) {
  return { x: (screenPoint.x - view.offsetX) / view.pixelsPerMetre, y: (screenPoint.y - view.offsetY) / view.pixelsPerMetre };
}

let stars = null;
function starsFor(world) {
  stars ??= Array.from({ length: 160 }, () => ({
    x: Math.random() * world.widthMetres,
    y: Math.random() * world.heightMetres,
    size: 0.03 + Math.random() * 0.06,
    brightness: 0.3 + Math.random() * 0.7,
  }));
  return stars;
}

export function drawGame(context, game, view, aimPoint) {
  const { world } = game.settings;
  context.fillStyle = colours.space;
  context.fillRect(0, 0, view.canvasWidth, view.canvasHeight);

  // Everything below, until the HUD, is drawn in world metres.
  context.save();
  context.translate(view.offsetX, view.offsetY);
  context.scale(view.pixelsPerMetre, view.pixelsPerMetre);
  context.fillStyle = colours.worldArea;
  context.fillRect(0, 0, world.widthMetres, world.heightMetres);
  for (const star of starsFor(world)) {
    context.globalAlpha = star.brightness;
    context.fillStyle = colours.star;
    context.fillRect(star.x, star.y, star.size, star.size);
  }
  context.globalAlpha = 1;

  game.comets.forEach((comet, cometIndex) => drawComet(context, comet, cometIndex));
  for (const crate of game.crateSpawner.crates) drawCrate(context, crate, game.settings.crates.size);
  if (isAlive(game.drone.vitals)) drawDrone(context, game.drone, game.settings.rules);
  if (isAlive(game.player.vitals)) drawPlayer(context, game.player, game.comets, aimPoint);
  for (const projectile of game.projectiles) drawProjectile(context, projectile);
  context.restore();

  drawHud(context, game, view);
}

function drawComet(context, comet, cometIndex) {
  const { x, y } = comet.centre;
  const shading = context.createRadialGradient(x - comet.radius * 0.35, y - comet.radius * 0.35, comet.radius * 0.1, x, y, comet.radius);
  shading.addColorStop(0, colours.cometInner);
  shading.addColorStop(1, colours.cometOuter);
  context.fillStyle = shading;
  context.beginPath();
  context.arc(x, y, comet.radius, 0, 2 * Math.PI);
  context.fill();
  // A few craters, placed the same way every frame.
  context.fillStyle = colours.crater;
  for (let craterNumber = 0; craterNumber < 4; craterNumber += 1) {
    const angle = cometIndex * 2.4 + craterNumber * 1.9;
    const distanceFromCentre = comet.radius * (0.2 + ((cometIndex * 0.37 + craterNumber * 0.29) % 0.55));
    const craterRadius = comet.radius * (0.1 + (craterNumber % 3) * 0.05);
    context.beginPath();
    context.arc(x + Math.cos(angle) * distanceFromCentre, y + Math.sin(angle) * distanceFromCentre, craterRadius, 0, 2 * Math.PI);
    context.fill();
  }
}

function drawCrate(context, crate, size) {
  context.save();
  context.translate(crate.position.x, crate.position.y);
  context.rotate(crate.angleOnComet + Math.PI / 2);
  context.fillStyle = colours.crate;
  context.strokeStyle = colours.crateEdge;
  context.lineWidth = 0.06;
  context.fillRect(-size / 2, -size / 2, size, size);
  context.strokeRect(-size / 2, -size / 2, size, size);
  context.beginPath();
  context.moveTo(-size / 2, -size / 2);
  context.lineTo(size / 2, size / 2);
  context.moveTo(size / 2, -size / 2);
  context.lineTo(-size / 2, size / 2);
  context.stroke();
  context.restore();
}

function isFlickering(vitals) {
  return vitals.protectionSecondsRemaining > 0 && Math.floor(vitals.protectionSecondsRemaining * 10) % 2 === 0;
}

function drawPlayer(context, player, comets, aimPoint) {
  // "Up" for the astronaut: away from the comet stood on, or away from the overall pull while flying.
  const pull = gravityAt(player.position, comets);
  const upDirection = player.movementMode === 'grounded' ? directionFromAngle(player.angleOnComet) : normalize({ x: -pull.x, y: -pull.y });
  const aimDirection = normalize(subtract(aimPoint, player.position));
  const radius = player.bodyRadius;

  context.save();
  context.globalAlpha = isFlickering(player.vitals) ? 0.35 : 1;
  context.translate(player.position.x, player.position.y);
  // Gun: a short stub pointing at the mouse.
  context.strokeStyle = colours.suitShade;
  context.lineWidth = radius * 0.35;
  context.beginPath();
  context.moveTo(0, 0);
  context.lineTo(aimDirection.x * radius * 1.5, aimDirection.y * radius * 1.5);
  context.stroke();
  // Boots on the "down" side.
  context.rotate(Math.atan2(upDirection.y, upDirection.x) + Math.PI / 2);
  context.fillStyle = colours.suitShade;
  context.fillRect(-radius * 0.7, radius * 0.55, radius * 0.55, radius * 0.45);
  context.fillRect(radius * 0.15, radius * 0.55, radius * 0.55, radius * 0.45);
  context.fillStyle = colours.suit;
  context.beginPath();
  context.arc(0, 0, radius, 0, 2 * Math.PI);
  context.fill();
  context.restore();

  // Visor looks towards the aim.
  context.save();
  context.globalAlpha = isFlickering(player.vitals) ? 0.35 : 1;
  context.fillStyle = colours.visor;
  context.beginPath();
  context.ellipse(player.position.x + aimDirection.x * radius * 0.35, player.position.y + aimDirection.y * radius * 0.35,
    radius * 0.5, radius * 0.38, Math.atan2(aimDirection.y, aimDirection.x), 0, 2 * Math.PI);
  context.fill();
  context.restore();
}

function drawDrone(context, drone, rules) {
  const { x, y } = drone.position;
  const radius = drone.bodyRadius;
  context.strokeStyle = colours.waypointLine;
  context.lineWidth = 0.05;
  context.setLineDash([0.3, 0.3]);
  context.beginPath();
  context.moveTo(x, y);
  context.lineTo(drone.waypoint.x, drone.waypoint.y);
  context.stroke();
  context.setLineDash([]);

  context.save();
  context.globalAlpha = isFlickering(drone.vitals) ? 0.35 : 1;
  context.strokeStyle = colours.droneDark;
  context.lineWidth = 0.1;
  context.beginPath();
  context.moveTo(x - radius * 1.4, y - radius * 0.6);
  context.lineTo(x + radius * 1.4, y - radius * 0.6);
  context.stroke();
  context.fillStyle = colours.drone;
  context.beginPath();
  context.arc(x, y, radius, 0, 2 * Math.PI);
  context.fill();
  context.fillStyle = colours.droneDark;
  context.beginPath();
  context.arc(x, y, radius * 0.4, 0, 2 * Math.PI);
  context.fill();
  context.restore();

  drawHealthBar(context, x - radius, y - radius - 0.35, radius * 2, 0.14, drone.vitals.health / rules.maxHealth);
}

function drawProjectile(context, projectile) {
  context.save();
  context.fillStyle = projectile.colour;
  context.shadowColor = projectile.colour;
  context.shadowBlur = 12;
  context.beginPath();
  context.arc(projectile.position.x, projectile.position.y, projectile.radius, 0, 2 * Math.PI);
  context.fill();
  context.restore();
}

function drawHealthBar(context, left, top, width, height, fractionFull) {
  context.fillStyle = colours.barBackground;
  context.fillRect(left, top, width, height);
  context.fillStyle = fractionFull > 0.3 ? colours.healthFull : colours.healthLow;
  context.fillRect(left, top, width * Math.max(0, fractionFull), height);
}

function drawLives(context, left, top, livesRemaining, startingLives, colour) {
  for (let life = 0; life < startingLives; life += 1) {
    context.fillStyle = life < livesRemaining ? colour : colours.barBackground;
    context.beginPath();
    context.arc(left + 7 + life * 18, top + 7, 6, 0, 2 * Math.PI);
    context.fill();
  }
}

function drawHud(context, game, view) {
  const { rules, weapons } = game.settings;
  const { player, drone } = game;
  context.font = '15px system-ui, sans-serif';
  context.textBaseline = 'top';

  // Player, top left.
  context.textAlign = 'left';
  context.fillStyle = colours.text;
  context.fillText('YOU', 16, 14);
  drawLives(context, 56, 14, player.vitals.livesRemaining, rules.startingLives, colours.visor);
  drawHealthBar(context, 16, 38, 180, 10, player.vitals.health / rules.maxHealth);
  const carried = selectedWeapon(player.arsenal);
  const weaponDefinition = weapons[carried.weaponName];
  const ammoText = carried.ammoRemaining === null ? '' : `  x${carried.ammoRemaining}`;
  context.fillText(`${weaponDefinition.displayName}${ammoText}`, 16, 56);
  const cooldownFraction = player.arsenal.cooldownSecondsRemaining / weaponDefinition.cooldownSeconds;
  context.fillStyle = colours.barBackground;
  context.fillRect(16, 76, 180, 4);
  context.fillStyle = weaponDefinition.projectileColour;
  context.fillRect(16, 76, 180 * (1 - Math.min(1, cooldownFraction)), 4);
  if (player.arsenal.carriedWeapons.length > 1) {
    context.fillStyle = colours.dimText;
    context.fillText(`Tab: switch (${player.arsenal.carriedWeapons.length} carried)`, 16, 86);
  }

  // Drone, top right.
  context.textAlign = 'right';
  context.fillStyle = colours.text;
  context.fillText('TARGET', view.canvasWidth - 16, 14);
  drawLives(context, view.canvasWidth - 16 - 70 - rules.startingLives * 18, 14, drone.vitals.livesRemaining, rules.startingLives, colours.drone);
  drawHealthBar(context, view.canvasWidth - 196, 38, 180, 10, drone.vitals.health / rules.maxHealth);

  context.fillStyle = colours.dimText;
  context.textAlign = 'left';
  context.textBaseline = 'bottom';
  context.fillText('Left/Right: run   Up: jump   Mouse: aim   Click: fire   Tab: switch weapon   R: restart', 16, view.canvasHeight - 12);

  context.textAlign = 'center';
  context.textBaseline = 'middle';
  const centreX = view.canvasWidth / 2;
  const centreY = view.canvasHeight / 2;
  if (game.outcome) {
    context.fillStyle = 'rgba(6, 9, 20, 0.7)';
    context.fillRect(0, centreY - 50, view.canvasWidth, 100);
    context.fillStyle = colours.text;
    context.font = 'bold 28px system-ui, sans-serif';
    context.fillText(game.outcome === 'targetDestroyed' ? 'Target destroyed!' : 'Out of lives', centreX, centreY - 12);
    context.font = '16px system-ui, sans-serif';
    context.fillText('Press R to play again', centreX, centreY + 22);
  } else if (player.vitals.state === 'waitingToRespawn') {
    context.fillStyle = colours.text;
    context.font = 'bold 22px system-ui, sans-serif';
    context.fillText(`Respawning in ${player.vitals.secondsUntilRespawn.toFixed(1)}`, centreX, centreY);
  }
}
