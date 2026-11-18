// Pedestrians: people walking the sidewalk loops around the blocks, pausing to
// look around, and running when danger comes near. A pedestrian hit by a car or
// punched falls, drops a little cash, and the witnesses raise the heat. Thugs
// (the warehouse crew) are pedestrians with a job: they chase and fight.

import { WORLD } from './config.js';
import { pick, range, rangeInt } from './random.js';

const SHIRTS = ['#e76f51', '#2a9d8f', '#e9c46a', '#6a8caf', '#b56576', '#8d99ae', '#f4a261', '#5a9e6f'];
const SKINS = ['#f1c27d', '#e0ac69', '#c68642', '#8d5524', '#ffdbac'];

let nextId = 1;

export function createPedestrian(x, y, angle, opts = {}) {
  return {
    id: nextId++,
    x,
    y,
    angle,
    speed: 0,
    state: 'walk', // 'walk' | 'idle' | 'flee' | 'down' | 'chase' | 'fight'
    shirt: opts.shirt ?? SHIRTS[0],
    skin: opts.skin ?? SKINS[0],
    hp: opts.hp ?? 30,
    loop: opts.loop ?? null,
    loopIndex: opts.loopIndex ?? 0,
    loopDir: opts.loopDir ?? 1,
    idleTime: 0,
    fleeTime: 0,
    downTime: 0,
    punchCd: 0,
    thug: opts.thug ?? false,
    walkPhase: Math.random() * Math.PI * 2,
    scared: false,
  };
}

export function spawnPedestrian(random, city) {
  const col = rangeInt(random, 0, WORLD.blocks - 1);
  const row = rangeInt(random, 0, WORLD.blocks - 1);
  const loop = city.sidewalkLoop(col, row);
  const index = rangeInt(random, 0, loop.length - 1);
  const at = loop[index];
  const ped = createPedestrian(at.x + range(random, -8, 8), at.y + range(random, -8, 8), 0, {
    loop,
    loopIndex: index,
    loopDir: random() < 0.5 ? 1 : -1,
    shirt: pick(random, SHIRTS),
    skin: pick(random, SKINS),
  });
  return ped;
}

/** A pedestrian notices danger: a punch, a speeding car, or a body nearby. */
export function scarePedestrian(ped, fromX, fromY, random = Math.random) {
  if (ped.state === 'down' || ped.thug) return;
  ped.state = 'flee';
  ped.fleeTime = 2.5 + random() * 2;
  ped.angle = Math.atan2(ped.y - fromY, ped.x - fromX);
  ped.scared = true;
}

function movePed(ped, dt, city) {
  const nx = ped.x + Math.cos(ped.angle) * ped.speed * dt;
  const ny = ped.y + Math.sin(ped.angle) * ped.speed * dt;
  const res = city.collideCircle(nx, ny, 12);
  ped.x = res.x;
  ped.y = res.y;
  ped.walkPhase += dt * (4 + ped.speed * 0.03);
}

export function updatePedestrian(ped, dt, world, events) {
  const { city, player } = world;
  if (ped.punchCd > 0) ped.punchCd -= dt;
  if (ped.state === 'down') {
    ped.downTime -= dt;
    ped.speed = 0;
    if (ped.downTime <= 0 && !ped.thug) {
      ped.state = 'flee';
      ped.fleeTime = 3;
      ped.hp = 30;
    }
    return;
  }
  if (ped.thug) {
    updateThug(ped, dt, world, events);
    return;
  }
  const dx = player.x - ped.x;
  const dy = player.y - ped.y;
  const dist = Math.hypot(dx, dy);
  if (ped.state === 'flee') {
    ped.fleeTime -= dt;
    ped.speed = 190;
    // Keep running away from the player, steering around solids by feel.
    const away = Math.atan2(-dy, -dx);
    let diff = away - ped.angle;
    while (diff > Math.PI) diff -= Math.PI * 2;
    while (diff < -Math.PI) diff += Math.PI * 2;
    ped.angle += Math.max(-3 * dt, Math.min(3 * dt, diff));
    const before = { x: ped.x, y: ped.y };
    movePed(ped, dt, city);
    if (Math.hypot(ped.x - before.x, ped.y - before.y) < ped.speed * dt * 0.3) ped.angle += 1.7;
    if (ped.fleeTime <= 0 || dist > 700) {
      ped.state = 'walk';
      ped.scared = false;
    }
    return;
  }
  // A fast car bearing down scares walkers off the street.
  for (const car of world.cars) {
    if (Math.abs(car.speed) > 240 && Math.hypot(car.x - ped.x, car.y - ped.y) < 120) {
      scarePedestrian(ped, car.x, car.y, world.random);
      return;
    }
  }
  if (ped.state === 'idle') {
    ped.idleTime -= dt;
    ped.speed = 0;
    if (ped.idleTime <= 0) ped.state = 'walk';
    return;
  }
  // Walk the sidewalk loop.
  ped.speed = 52;
  const loop = ped.loop;
  if (!loop) return;
  const target = loop[ped.loopIndex];
  const tx = target.x - ped.x;
  const ty = target.y - ped.y;
  const td = Math.hypot(tx, ty);
  if (td < 14) {
    ped.loopIndex = (ped.loopIndex + ped.loopDir + loop.length) % loop.length;
    if (world.random() < 0.06) {
      ped.state = 'idle';
      ped.idleTime = 1 + world.random() * 2.5;
    }
    return;
  }
  ped.angle = Math.atan2(ty, tx);
  movePed(ped, dt, city);
}

/** Thugs guard the warehouse: they chase the player on sight and swing back. */
function updateThug(ped, dt, world, events) {
  const { city, player, missions } = world;
  const dx = player.x - ped.x;
  const dy = player.y - ped.y;
  const dist = Math.hypot(dx, dy);
  const active = missions.index === 2 && !missions.done.includes(2);
  if (!active || dist > 420) {
    // Lounging by the warehouse: idle sway, facing the street.
    ped.speed = 0;
    ped.angle += Math.sin(world.time * 0.7 + ped.id) * 0.002;
    return;
  }
  if (dist > 30) {
    ped.state = 'chase';
    ped.speed = 165;
    ped.angle = Math.atan2(dy, dx);
    movePed(ped, dt, city);
  } else {
    ped.state = 'fight';
    ped.speed = 0;
    ped.angle = Math.atan2(dy, dx);
    if (ped.punchCd <= 0 && player.hp > 0 && player.carId === null) {
      ped.punchCd = 1.0;
      events.push({ type: 'thugPunch', x: ped.x, y: ped.y, from: ped });
    }
  }
}

/** Draw a person top-down: shadow, shoulders, head, and a walk bob. */
export function drawPedestrian(ctx, ped, time) {
  const bob = ped.speed > 1 ? Math.sin(ped.walkPhase) * 1.5 : 0;
  ctx.save();
  ctx.translate(ped.x, ped.y + bob * 0.3);
  if (ped.state === 'down') {
    // Lying flat: a long shadow and a still body.
    ctx.rotate(ped.angle);
    ctx.fillStyle = 'rgba(40, 25, 10, 0.25)';
    ctx.beginPath();
    ctx.ellipse(2, 3, 18, 9, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = ped.shirt;
    ctx.beginPath();
    ctx.ellipse(0, 0, 17, 8, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = ped.skin;
    ctx.beginPath();
    ctx.arc(17, 0, 6, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
    return;
  }
  ctx.rotate(ped.angle + Math.PI / 2);
  ctx.fillStyle = 'rgba(40, 25, 10, 0.28)';
  ctx.beginPath();
  ctx.ellipse(1, 3, 11, 9, 0, 0, Math.PI * 2);
  ctx.fill();
  // Shoulders.
  ctx.fillStyle = ped.shirt;
  ctx.beginPath();
  ctx.ellipse(0, 2, 10, 8, 0, 0, Math.PI * 2);
  ctx.fill();
  // Head.
  ctx.fillStyle = ped.skin;
  ctx.beginPath();
  ctx.arc(0, -4, 6.5, 0, Math.PI * 2);
  ctx.fill();
  // Hair cap.
  ctx.fillStyle = ped.thug ? '#22242a' : '#4a3226';
  ctx.beginPath();
  ctx.arc(0, -5.5, 6.5, Math.PI, Math.PI * 2);
  ctx.fill();
  if (ped.thug) {
    // Red bandana: the warehouse crew is easy to spot.
    ctx.fillStyle = '#c0392b';
    ctx.fillRect(-6, -8, 12, 3);
  }
  ctx.restore();
  // Panic mark above a fleeing pedestrian.
  if (ped.state === 'flee') {
    ctx.fillStyle = '#ffd166';
    ctx.font = 'bold 13px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('!', ped.x, ped.y - 20 - Math.sin(time * 8) * 2);
  }
}
