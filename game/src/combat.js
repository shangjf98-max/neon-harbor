// Melee combat: the player's punch, its arc, who it hits, and what happens
// next. Punching a pedestrian knocks them down and scares the witnesses;
// punching a thug starts a fight. Cars that strike pedestrians are handled
// here too, since the wanted level treats them the same way.

import { PLAYER } from './config.js';
import { scarePedestrian } from './pedestrians.js';

/** The player's punch: one swing, every pedestrian in the arc takes damage. */
export function resolvePunch(world, events) {
  const player = world.player;
  if (player.punchCd > 0 || player.carId !== null || player.dead) return;
  player.punchCd = PLAYER.punchCooldown;
  player.punchAnim = 0.18;
  events.push({ type: 'punch', x: player.x + Math.cos(player.angle) * 26, y: player.y + Math.sin(player.angle) * 26 });
  let hitAnyone = false;
  let hitCivilian = false;
  for (const ped of world.peds) {
    if (ped.state === 'down') continue;
    const dx = ped.x - player.x;
    const dy = ped.y - player.y;
    const dist = Math.hypot(dx, dy);
    if (dist > PLAYER.punchRange + 12) continue;
    let diff = Math.atan2(dy, dx) - player.angle;
    while (diff > Math.PI) diff -= Math.PI * 2;
    while (diff < -Math.PI) diff += Math.PI * 2;
    if (Math.abs(diff) > PLAYER.punchArc) continue;
    hitAnyone = true;
    if (!ped.thug) hitCivilian = true;
    ped.hp -= PLAYER.punchDamage;
    // Knockback away from the player.
    const nx = ped.x + (dx / (dist || 1)) * 22;
    const ny = ped.y + (dy / (dist || 1)) * 22;
    const res = world.city.collideCircle(nx, ny, 12);
    ped.x = res.x;
    ped.y = res.y;
    events.push({ type: 'hit', x: ped.x, y: ped.y });
    if (ped.hp <= 0) {
      ped.state = 'down';
      ped.downTime = ped.thug ? 9999 : 6;
      events.push({ type: 'knockdown', x: ped.x, y: ped.y, thug: ped.thug });
      if (ped.thug) {
        world.missions.thugsLeft = Math.max(0, world.missions.thugsLeft - 1);
        dropCash(world, ped.x, ped.y, 20);
      } else {
        dropCash(world, ped.x, ped.y, 10);
      }
    } else if (!ped.thug) {
      scarePedestrian(ped, player.x, player.y, world.random);
    }
  }
  if (hitAnyone) {
    // Thugs settle their own scores; only a civilian assault draws the heat.
    if (hitCivilian) events.push({ type: 'crime', kind: 'assault', x: player.x, y: player.y });
    // Witnesses nearby run for it.
    for (const ped of world.peds) {
      if (ped.thug || ped.state === 'down') continue;
      if (Math.hypot(ped.x - player.x, ped.y - player.y) < 220) scarePedestrian(ped, player.x, player.y, world.random);
    }
  }
}

/** A car striking a pedestrian: the pedestrian goes down, the driver pays in stars. */
export function checkCarPedestrianHits(world, events) {
  const player = world.player;
  for (const car of world.cars) {
    if (Math.abs(car.speed) < 60) continue;
    for (const ped of world.peds) {
      if (ped.state === 'down') continue;
      const dx = ped.x - car.x;
      const dy = ped.y - car.y;
      if (Math.hypot(dx, dy) > 30) continue;
      ped.hp = 0;
      ped.state = 'down';
      ped.downTime = ped.thug ? 9999 : 8;
      ped.x += (dx / (Math.hypot(dx, dy) || 1)) * 26;
      ped.y += (dy / (Math.hypot(dx, dy) || 1)) * 26;
      events.push({ type: 'knockdown', x: ped.x, y: ped.y, thug: ped.thug });
      if (car.driver === 'player' && !ped.thug) {
        events.push({ type: 'crime', kind: 'hitPedestrian', x: ped.x, y: ped.y });
      }
      if (car.driver === 'player' && ped.thug) {
        world.missions.thugsLeft = Math.max(0, world.missions.thugsLeft - 1);
      }
      for (const other of world.peds) {
        if (!other.thug && other.state !== 'down' && Math.hypot(other.x - ped.x, other.y - ped.y) < 260) {
          scarePedestrian(other, car.x, car.y, world.random);
        }
      }
    }
  }
}

/** Cash on the ground: walk over it to pocket it. */
export function dropCash(world, x, y, amount) {
  world.pickups.push({ x, y, amount, life: 30, bob: Math.random() * Math.PI * 2 });
}

export function updatePickups(world, dt, events) {
  const player = world.player;
  for (let i = world.pickups.length - 1; i >= 0; i -= 1) {
    const p = world.pickups[i];
    p.life -= dt;
    p.bob += dt * 3;
    if (p.life <= 0) {
      world.pickups.splice(i, 1);
      continue;
    }
    if (player.carId === null && Math.hypot(p.x - player.x, p.y - player.y) < 26) {
      player.money += p.amount;
      events.push({ type: 'cash', x: p.x, y: p.y, amount: p.amount });
      world.pickups.splice(i, 1);
    }
  }
}

/** Draw the cash pickups: green bills with a soft glow. */
export function drawPickups(ctx, world, time) {
  for (const p of world.pickups) {
    const bob = Math.sin(p.bob) * 2;
    ctx.save();
    ctx.translate(p.x, p.y + bob);
    ctx.rotate(Math.sin(time + p.bob) * 0.2);
    ctx.fillStyle = 'rgba(123, 228, 149, 0.25)';
    ctx.beginPath();
    ctx.arc(0, 0, 14, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#4caf6d';
    ctx.fillRect(-9, -6, 18, 12);
    ctx.fillStyle = '#d7ffd7';
    ctx.font = 'bold 10px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('$', 0, 1);
    ctx.restore();
  }
}
