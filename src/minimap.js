// The minimap: the whole city shrunk into a round frame — roads, blocks, water,
// the player, police, the mission marker and the garage. It is drawn from the
// same city data as the main view, so it never disagrees with the world.

import { PALETTE, WORLD } from './config.js';
import { missionMarker } from './missions.js';

export function drawMinimap(ctx, world, x, y, radius, time) {
  const scale = (radius * 2) / WORLD.size;
  ctx.save();
  ctx.beginPath();
  ctx.arc(x, y, radius, 0, Math.PI * 2);
  ctx.clip();
  // Base.
  ctx.fillStyle = '#8a7d5c';
  ctx.fillRect(x - radius, y - radius, radius * 2, radius * 2);
  const px = (wx) => x - radius + wx * scale;
  const py = (wy) => y - radius + wy * scale;
  // Blocks.
  for (const block of world.city.blocks) {
    ctx.fillStyle =
      block.kind === 'park'
        ? PALETTE.park
        : block.kind === 'harbor'
          ? PALETTE.sand
          : block.kind === 'plaza'
            ? PALETTE.plaza
            : block.kind === 'station'
              ? '#7d9cc4'
              : block.kind === 'hospital'
                ? '#e8e8e8'
                : '#c9b98f';
    ctx.fillRect(px(block.rect.x), py(block.rect.y), block.rect.w * scale, block.rect.h * scale);
    if (block.water) {
      ctx.fillStyle = PALETTE.water;
      ctx.fillRect(px(block.water.x), py(block.water.y), block.water.w * scale, block.water.h * scale);
    }
  }
  // Roads.
  ctx.fillStyle = PALETTE.road;
  for (const c of WORLD.roadCentres) {
    ctx.fillRect(px(c - WORLD.road / 2), y - radius, WORLD.road * scale, radius * 2);
    ctx.fillRect(x - radius, py(c - WORLD.road / 2), radius * 2, WORLD.road * scale);
  }
  // The player's car, when parked somewhere.
  for (const car of world.cars) {
    if (car.driver === 'police') continue;
    if (!car.keep && car.driver !== 'player') continue;
    ctx.fillStyle = 'rgba(255,255,255,0.7)';
    ctx.fillRect(px(car.x) - 1.5, py(car.y) - 1.5, 3, 3);
  }
  // Police blips flash red and blue.
  const policeOn = Math.sin(time * 6) > 0;
  for (const car of world.cars) {
    if (car.driver !== 'police') continue;
    ctx.fillStyle = policeOn ? '#ff5252' : '#4d7cff';
    ctx.beginPath();
    ctx.arc(px(car.x), py(car.y), 3.5, 0, Math.PI * 2);
    ctx.fill();
  }
  // Mission marker: a pulsing gold diamond with a ring (none while evading).
  const marker = missionMarker(world);
  if (marker) {
    const pulse = 1 + Math.sin(time * 4) * 0.25;
    ctx.fillStyle = PALETTE.marker;
    ctx.beginPath();
    ctx.arc(px(marker.x), py(marker.y), 5 * pulse, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = 'rgba(255, 209, 102, 0.6)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(px(marker.x), py(marker.y), 8 * pulse, 0, Math.PI * 2);
    ctx.stroke();
  }
  // The player: a white arrow pointing where they face.
  ctx.save();
  ctx.translate(px(world.player.x), py(world.player.y));
  ctx.rotate(world.player.angle);
  ctx.fillStyle = '#ffffff';
  ctx.strokeStyle = '#22242a';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(6, 0);
  ctx.lineTo(-4, -4);
  ctx.lineTo(-2, 0);
  ctx.lineTo(-4, 4);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  ctx.restore();
  ctx.restore();
  // Frame and north mark.
  ctx.strokeStyle = 'rgba(20, 18, 24, 0.85)';
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.arc(x, y, radius, 0, Math.PI * 2);
  ctx.stroke();
  ctx.strokeStyle = 'rgba(245, 225, 160, 0.5)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.arc(x, y, radius - 2, 0, Math.PI * 2);
  ctx.stroke();
  ctx.fillStyle = PALETTE.text;
  ctx.font = 'bold 11px system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('N', x, y - radius + 13);
}
