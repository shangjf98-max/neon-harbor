// Cars: their models, arcade driving physics, collisions with the city and
// each other, damage and smoke, and how each one is drawn top-down. A car is a
// body with two collision circles (nose and tail); traffic, police and the
// player's car are all the same object, steered by different drivers.

import { WORLD } from './config.js';

/** The models on Neon Harbor's streets: size, speed, handling and paint. */
export const MODELS = {
  sedan: { length: 48, width: 23, accel: 260, brake: 420, maxSpeed: 430, reverse: 150, turn: 2.6, grip: 0.9, colors: ['#c94f4f', '#4f7ec9', '#c9a44f', '#7a8a99', '#5a9e6f'] },
  taxi: { length: 48, width: 23, accel: 250, brake: 400, maxSpeed: 410, reverse: 140, turn: 2.6, grip: 0.9, colors: ['#f2c14e'] },
  van: { length: 56, width: 25, accel: 190, brake: 340, maxSpeed: 340, reverse: 120, turn: 2.1, grip: 0.8, colors: ['#e8e8e8', '#8d99ae', '#b08968'] },
  sports: { length: 46, width: 22, accel: 360, brake: 520, maxSpeed: 560, reverse: 170, turn: 3.1, grip: 1.0, colors: ['#e63946', '#ffd166', '#2a9d8f'] },
  truck: { length: 62, width: 26, accel: 150, brake: 300, maxSpeed: 300, reverse: 100, turn: 1.8, grip: 0.7, colors: ['#6c757d', '#a44a3f'] },
  police: { length: 50, width: 24, accel: 320, brake: 500, maxSpeed: 520, reverse: 160, turn: 2.9, grip: 1.0, colors: ['#f2f2f2'] },
};

let nextId = 1;

/** Restart the id sequence so a rebuilt world hands out the same ids (saves rely on it). */
export function resetCarIds() {
  nextId = 1;
}

export function createCar(model, x, y, angle, color) {
  const spec = MODELS[model];
  return {
    id: nextId++,
    model,
    x,
    y,
    angle,
    speed: 0,
    steer: 0,
    color: color ?? spec.colors[0],
    hp: 100,
    parked: false,
    stolen: false,
    keep: false, // saved games keep this car
    driver: 'none', // 'none' | 'traffic' | 'player' | 'police'
    route: null, // traffic: {from, to} intersection points
    routeT: 0,
    wait: 0,
    brakeLight: false,
    sirenPhase: Math.random() * Math.PI * 2,
    smoke: 0,
    skid: 0,
  };
}

/** The two collision circles of a car, nose and tail. */
export function carCircles(car) {
  const spec = MODELS[car.model];
  const off = spec.length * 0.26;
  const cos = Math.cos(car.angle);
  const sin = Math.sin(car.angle);
  return [
    { x: car.x + cos * off, y: car.y + sin * off, r: spec.width * 0.62 },
    { x: car.x - cos * off, y: car.y - sin * off, r: spec.width * 0.62 },
  ];
}

/** Damage a car. Mission cars keep a drivable floor so a wrecked story car can't soft-lock a mission. */
function damageCar(car, amount) {
  const floor = car.missionCar ? 20 : 0;
  car.hp = Math.max(floor, car.hp - amount);
}

/**
 * Advance one car under its driver's throttle/steer, resolve the city and the
 * other cars, and return collision events for sound and damage. `city` is the
 * generated city, `others` every other car.
 */
export function stepCar(car, dt, throttle, steer, city, others, events) {
  const spec = MODELS[car.model];
  // A wrecked car is dead: it rolls to a stop and answers nothing.
  if (car.hp <= 0) throttle = 0;
  if (throttle > 0) {
    car.speed += spec.accel * throttle * dt;
  } else if (throttle < 0) {
    if (car.speed > 5) car.speed += spec.brake * throttle * dt;
    else car.speed = Math.max(-spec.reverse, car.speed + spec.accel * 0.7 * throttle * dt);
  }
  // Drag and rolling resistance pull the car toward a stop.
  car.speed -= car.speed * (0.55 + (car.parked ? 4 : 0)) * dt;
  if (Math.abs(car.speed) < 2 && throttle === 0) car.speed = 0;
  car.speed = Math.max(-spec.reverse, Math.min(spec.maxSpeed, car.speed));
  car.brakeLight = throttle < 0 && car.speed > 5;

  const speedFactor = Math.min(1, Math.abs(car.speed) / 180);
  car.steer += (steer - car.steer) * Math.min(1, dt * 8);
  car.angle += car.steer * spec.turn * speedFactor * dt * (car.speed < 0 ? -1 : 1);

  const nx = car.x + Math.cos(car.angle) * car.speed * dt;
  const ny = car.y + Math.sin(car.angle) * car.speed * dt;
  const before = { x: car.x, y: car.y };
  car.x = nx;
  car.y = ny;

  // City collision: each circle is pushed out of solids; a hard hit costs speed and paint.
  let hit = false;
  for (const c of carCircles(car)) {
    const res = city.collideCircle(c.x, c.y, c.r);
    if (res.moved) {
      const dx = res.x - c.x;
      const dy = res.y - c.y;
      car.x += dx;
      car.y += dy;
      hit = true;
    }
  }
  if (hit) {
    const impact = Math.abs(car.speed);
    if (impact > 90) {
      damageCar(car, impact * 0.03);
      events.push({ type: 'crash', x: car.x, y: car.y, hard: impact > 220 });
    }
    car.speed *= 0.35;
    car.skid = 1;
  }

  // Car-to-car: separate overlapping circles and trade a little speed.
  // A centre-distance broadphase skips distant cars before any circle work.
  for (const other of others) {
    if (other === car) continue;
    if (Math.hypot(other.x - car.x, other.y - car.y) > 90) continue;
    for (const a of carCircles(car)) {
      for (const b of carCircles(other)) {
        const dx = a.x - b.x;
        const dy = a.y - b.y;
        const d = Math.hypot(dx, dy);
        const min = a.r + b.r;
        if (d > 0 && d < min) {
          const push = (min - d) / 2;
          const ux = dx / d;
          const uy = dy / d;
          const closing = Math.abs(car.speed - other.speed);
          if (closing > 60) {
            damageCar(car, closing * 0.02);
            damageCar(other, closing * 0.02);
            events.push({ type: 'crash', x: (a.x + b.x) / 2, y: (a.y + b.y) / 2, hard: closing > 200 });
          }
          if (other.parked && !car.parked) {
            // Shove the parked car aside: it slides the full overlap and keeps
            // no speed, while the moving car plows on instead of stalling.
            other.x -= ux * (min - d);
            other.y -= uy * (min - d);
            other.speed = 0;
            continue;
          }
          if (car.parked && !other.parked) {
            car.x += ux * (min - d);
            car.y += uy * (min - d);
            car.speed = 0;
            continue;
          }
          car.x += ux * push;
          car.y += uy * push;
          other.x -= ux * push;
          other.y -= uy * push;
          // Trade speed only on a real impact. Averaging every step while two
          // cars lean on each other glues them together: each one's drive is
          // cancelled by the other's, so neither can pull away — a driver
          // boxed in by cruisers stays boxed in forever. Gentle contact just
          // shoves the cars apart and lets each keep its own speed.
          if (closing > 60) {
            const avg = (car.speed + other.speed) / 2;
            car.speed = avg;
            other.speed = avg;
          }
          // A parked car that gets shoved stays put instead of rolling away forever.
          if (other.parked) other.speed = 0;
          if (car.parked) car.speed = 0;
        }
      }
    }
  }

  // Skid marks and smoke trail markers for the renderer.
  if (Math.abs(car.speed) > 300 && Math.abs(car.steer) > 0.6) car.skid = 1;
  if (car.hp < 35) car.smoke = Math.min(1, car.smoke + dt * 0.5);
  else car.smoke = Math.max(0, car.smoke - dt);

  // Keep inside the world.
  car.x = Math.max(20, Math.min(WORLD.size - 20, car.x));
  car.y = Math.max(20, Math.min(WORLD.size - 20, car.y));
  return { moved: Math.hypot(car.x - before.x, car.y - before.y), hit };
}

/** Draw one car top-down: shadow, body, roof, glass, lights and damage smoke. */
export function drawCar(ctx, car, time) {
  const spec = MODELS[car.model];
  const L = spec.length;
  const W = spec.width;
  ctx.save();
  ctx.translate(car.x, car.y);
  ctx.rotate(car.angle);
  // Shadow.
  ctx.fillStyle = 'rgba(40, 25, 10, 0.30)';
  roundRect(ctx, -L / 2 + 2, -W / 2 + 3, L, W, 7);
  ctx.fill();
  // Body.
  ctx.fillStyle = car.color;
  roundRect(ctx, -L / 2, -W / 2, L, W, 7);
  ctx.fill();
  ctx.strokeStyle = 'rgba(0,0,0,0.25)';
  ctx.lineWidth = 1;
  ctx.stroke();
  // Police livery: dark doors and a light bar.
  if (car.model === 'police') {
    ctx.fillStyle = '#22242a';
    ctx.fillRect(-L * 0.18, -W / 2, L * 0.36, W);
    ctx.fillStyle = '#f2f2f2';
    ctx.fillRect(L * 0.18, -W / 2 + 2, L * 0.16, W - 4);
    const phase = Math.sin(time * 10 + car.sirenPhase) > 0;
    ctx.fillStyle = phase ? '#ff4040' : '#4070ff';
    ctx.fillRect(-6, -W / 2 + 2, 5, 5);
    ctx.fillStyle = phase ? '#4070ff' : '#ff4040';
    ctx.fillRect(1, -W / 2 + 2, 5, 5);
    ctx.fillStyle = '#1b2a4a';
    ctx.fillRect(-L * 0.28, -W / 2 + 5, L * 0.2, 3);
  }
  // Taxi sign.
  if (car.model === 'taxi') {
    ctx.fillStyle = '#22242a';
    ctx.fillRect(-5, -4, 10, 8);
    ctx.fillStyle = '#f2c14e';
    ctx.fillRect(-4, -3, 8, 6);
  }
  // Windshield and rear glass.
  ctx.fillStyle = 'rgba(180, 220, 235, 0.9)';
  roundRect(ctx, L * 0.14, -W / 2 + 4, L * 0.2, W - 8, 3);
  ctx.fill();
  ctx.fillStyle = 'rgba(140, 170, 190, 0.8)';
  roundRect(ctx, -L * 0.34, -W / 2 + 4, L * 0.14, W - 8, 3);
  ctx.fill();
  // Roof.
  ctx.fillStyle = shade(car.color, -18);
  roundRect(ctx, -L * 0.12, -W / 2 + 3, L * 0.26, W - 6, 4);
  ctx.fill();
  // Headlights and tail lights.
  ctx.fillStyle = '#fff8d0';
  ctx.fillRect(L / 2 - 3, -W / 2 + 3, 3, 5);
  ctx.fillRect(L / 2 - 3, W / 2 - 8, 3, 5);
  ctx.fillStyle = car.brakeLight ? '#ff2a2a' : '#a02020';
  ctx.fillRect(-L / 2, -W / 2 + 3, 3, 5);
  ctx.fillRect(-L / 2, W / 2 - 8, 3, 5);
  // Wheels.
  ctx.fillStyle = '#1c1c20';
  const ww = 8;
  const wh = 4;
  ctx.fillRect(L * 0.3, -W / 2 - 2, ww, wh);
  ctx.fillRect(L * 0.3, W / 2 - 2, ww, wh);
  ctx.fillRect(-L * 0.3 - ww, -W / 2 - 2, ww, wh);
  ctx.fillRect(-L * 0.3 - ww, W / 2 - 2, ww, wh);
  ctx.restore();
  // Damage smoke, drawn in world space.
  if (car.smoke > 0.05) {
    ctx.fillStyle = `rgba(90, 90, 90, ${0.25 * car.smoke})`;
    const s = 10 + 8 * Math.sin(time * 6 + car.id);
    ctx.beginPath();
    ctx.arc(car.x + Math.cos(car.angle) * (L / 2) + Math.sin(time * 3) * 4, car.y + Math.sin(car.angle) * (L / 2) - 8, s, 0, Math.PI * 2);
    ctx.fill();
  }
}

export function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

/** Darken or lighten a #rrggbb colour by an amount. */
export function shade(hex, amount) {
  const n = parseInt(hex.slice(1), 16);
  const r = Math.max(0, Math.min(255, (n >> 16) + amount));
  const g = Math.max(0, Math.min(255, ((n >> 8) & 0xff) + amount));
  const b = Math.max(0, Math.min(255, (n & 0xff) + amount));
  return `rgb(${r},${g},${b})`;
}
