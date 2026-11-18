// The player on foot: walking and sprinting with building collision, getting in
// and out of cars, punching, taking damage and recovering. Driving lives in
// vehicles.js; the wanted level and the bust live in police.js.

import { PLAYER } from './config.js';
import { carCircles } from './vehicles.js';

export function createPlayer(x, y) {
  return {
    x,
    y,
    angle: -Math.PI / 2,
    hp: PLAYER.hp,
    money: 50,
    carId: null,
    punchCd: 0,
    punchAnim: 0,
    hurtTime: 0,
    lastDamage: -99,
    moving: false,
    walkPhase: 0,
    dead: false,
  };
}

/** The nearest car whose door is in reach, or null. */
export function nearestCar(world, maxDist) {
  let best = null;
  let bestD = maxDist;
  for (const car of world.cars) {
    if (car.driver === 'police') continue;
    const d = Math.hypot(car.x - world.player.x, car.y - world.player.y);
    if (d < bestD) {
      bestD = d;
      best = car;
    }
  }
  return best;
}

export function enterCar(world, car, events) {
  const player = world.player;
  const wasTraffic = car.driver === 'traffic';
  player.carId = car.id;
  car.driver = 'player';
  car.parked = false;
  if (wasTraffic) car.route = null;
  events.push({ type: 'door', x: car.x, y: car.y });
  // Stealing a car that is not yours draws the heat, once per car.
  if (!car.owned && !car.stolen) {
    car.stolen = true;
    car.keep = true;
    events.push({ type: 'crime', kind: 'steal', x: car.x, y: car.y });
  }
}

export function exitCar(world, events) {
  const player = world.player;
  const car = world.cars.find((c) => c.id === player.carId);
  if (!car) return;
  // Step out on the driver's side, clear of the body.
  const side = car.angle + Math.PI / 2;
  const px = car.x + Math.cos(side) * 34;
  const py = car.y + Math.sin(side) * 34;
  const res = world.city.collideCircle(px, py, PLAYER.radius);
  player.x = res.x;
  player.y = res.y;
  player.angle = car.angle;
  player.carId = null;
  car.driver = 'none';
  car.parked = Math.abs(car.speed) < 5;
  car.speed = 0;
  events.push({ type: 'door', x: player.x, y: player.y });
}

export function damagePlayer(world, amount, fromX, fromY, events) {
  const player = world.player;
  if (player.dead || player.hp <= 0) return;
  player.hp = Math.max(0, player.hp - amount);
  player.hurtTime = 0.4;
  player.lastDamage = world.time;
  events.push({ type: 'hurt', x: player.x, y: player.y });
  if (player.hp <= 0) {
    player.dead = true;
    events.push({ type: 'wasted', x: player.x, y: player.y });
  }
}

/** One on-foot step: move, collide, punch, regenerate. Returns nothing; events carry the news. */
export function updatePlayer(world, dt, input, events) {
  const player = world.player;
  const { city } = world;
  if (player.punchCd > 0) player.punchCd -= dt;
  if (player.punchAnim > 0) player.punchAnim -= dt;
  if (player.hurtTime > 0) player.hurtTime -= dt;
  if (player.dead) return;

  // Health comes back after a few quiet seconds.
  if (player.hp < PLAYER.hp && world.time - player.lastDamage > PLAYER.regenDelay) {
    player.hp = Math.min(PLAYER.hp, player.hp + PLAYER.regenRate * dt);
  }

  if (player.carId !== null) return; // driving is handled by the car step
  const move = input.moveVector();
  const sprint = input.sprinting();
  const speed = sprint ? PLAYER.sprint : PLAYER.walk;
  player.moving = move.x !== 0 || move.y !== 0;
  if (player.moving) {
    player.angle = Math.atan2(move.y, move.x);
    const nx = player.x + move.x * speed * dt;
    const ny = player.y + move.y * speed * dt;
    const res = city.collideCircle(nx, ny, PLAYER.radius);
    player.x = res.x;
    player.y = res.y;
    player.walkPhase += dt * (sprint ? 13 : 9);
  }
}

/** Draw the player on foot: shadow, jacket, head, and the punch swing. */
export function drawPlayer(ctx, player, time) {
  if (player.carId !== null) return;
  const bob = player.moving ? Math.sin(player.walkPhase) * 1.6 : 0;
  ctx.save();
  ctx.translate(player.x, player.y + bob * 0.3);
  ctx.rotate(player.angle + Math.PI / 2);
  ctx.fillStyle = 'rgba(40, 25, 10, 0.30)';
  ctx.beginPath();
  ctx.ellipse(1, 3, 12, 10, 0, 0, Math.PI * 2);
  ctx.fill();
  // Jacket.
  ctx.fillStyle = player.hurtTime > 0 ? '#d64545' : '#2b4c9b';
  ctx.beginPath();
  ctx.ellipse(0, 2, 11, 9, 0, 0, Math.PI * 2);
  ctx.fill();
  // Punch swing: a fist reaching forward.
  if (player.punchAnim > 0) {
    ctx.fillStyle = '#f1c27d';
    ctx.beginPath();
    ctx.arc(0, -20, 5, 0, Math.PI * 2);
    ctx.fill();
  }
  // Head.
  ctx.fillStyle = '#f1c27d';
  ctx.beginPath();
  ctx.arc(0, -4, 7, 0, Math.PI * 2);
  ctx.fill();
  // Cap.
  ctx.fillStyle = '#ffd166';
  ctx.beginPath();
  ctx.arc(0, -5.5, 7, Math.PI, Math.PI * 2);
  ctx.fill();
  ctx.fillRect(-7, -7, 14, 2);
  ctx.restore();
  // Hurt flash ring.
  if (player.hurtTime > 0) {
    ctx.strokeStyle = `rgba(255, 80, 80, ${player.hurtTime * 1.6})`;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(player.x, player.y, 20, 0, Math.PI * 2);
    ctx.stroke();
  }
}
