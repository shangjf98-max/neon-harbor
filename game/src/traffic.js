// The city's traffic: cars that follow the road grid, keep to the right side,
// slow for the car ahead and pick a new street at each intersection. Traffic
// stays near the player: cars far away are recycled to a road near the camera
// so the streets always feel alive without simulating the whole city.

import { TRAFFIC_COUNT, WORLD } from './config.js';
import { pick, range } from './random.js';
import { MODELS, createCar, stepCar } from './vehicles.js';

const TRAFFIC_MODELS = ['sedan', 'sedan', 'taxi', 'van', 'truck', 'sedan'];

/** All intersections of the road grid. */
function intersections() {
  const out = [];
  for (const x of WORLD.roadCentres) for (const y of WORLD.roadCentres) out.push({ x, y });
  return out;
}

/** Pick a neighbouring intersection, preferring not to turn straight back. */
function nextIntersection(random, from, prev) {
  const step = WORLD.pitch;
  const options = [
    { x: from.x + step, y: from.y },
    { x: from.x - step, y: from.y },
    { x: from.x, y: from.y + step },
    { x: from.x, y: from.y - step },
  ].filter((p) => p.x >= 0 && p.x <= WORLD.size && p.y >= 0 && p.y <= WORLD.size);
  const forward = options.filter((p) => !(prev && p.x === prev.x && p.y === prev.y));
  return pick(random, forward.length > 0 ? forward : options);
}

/** The lane offset that puts a car on the right side of its direction of travel. */
function laneOffset(from, to) {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const len = Math.hypot(dx, dy) || 1;
  // Right-hand side: rotate the direction by -90 degrees, a quarter road out.
  return { x: (-dy / len) * (WORLD.road / 4), y: (dx / len) * (WORLD.road / 4) };
}

export function spawnTrafficCar(random, nearX, nearY) {
  // Spawn beyond the visible frame so cars never pop into view.
  const spots = intersections().filter((p) => Math.hypot(p.x - nearX, p.y - nearY) > 700);
  const at = pick(random, spots.length > 0 ? spots : intersections());
  const model = pick(random, TRAFFIC_MODELS);
  const spec = MODELS[model];
  const color = pick(random, spec.colors);
  const car = createCar(model, at.x, at.y, 0, color);
  car.driver = 'traffic';
  car.parked = false;
  const to = nextIntersection(random, at, null);
  const off = laneOffset(at, to);
  car.x = at.x + off.x;
  car.y = at.y + off.y;
  car.angle = Math.atan2(to.y - at.y, to.x - at.x);
  car.route = { from: at, to, prev: null };
  car.wait = range(random, 0, 0.6);
  return car;
}

/** Steer a traffic car toward its route target, slowing for whatever is ahead. */
function driveTraffic(car, dt, random, cars, city, events, player) {
  const route = car.route;
  if (!route) return;
  const off = laneOffset(route.from, route.to);
  const tx = route.to.x + off.x;
  const ty = route.to.y + off.y;
  const dx = tx - car.x;
  const dy = ty - car.y;
  const dist = Math.hypot(dx, dy);
  if (dist < 26) {
    const prev = route.from;
    const from = route.to;
    const to = nextIntersection(random, from, prev);
    car.route = { from, to, prev };
    return;
  }
  const targetAngle = Math.atan2(dy, dx);
  let diff = targetAngle - car.angle;
  while (diff > Math.PI) diff -= Math.PI * 2;
  while (diff < -Math.PI) diff += Math.PI * 2;
  const steer = Math.max(-1, Math.min(1, diff * 2.2));

  // Look ahead: brake for a car stopped in front, and never rear-end the player.
  let throttle = 0.55;
  const aheadX = car.x + Math.cos(car.angle) * 70;
  const aheadY = car.y + Math.sin(car.angle) * 70;
  for (const other of cars) {
    if (other === car) continue;
    if (Math.hypot(other.x - aheadX, other.y - aheadY) < 42) {
      throttle = other.speed < 20 ? -0.6 : 0.15;
      break;
    }
  }
  // Yield to a pedestrian on foot ahead: brake while moving, hold once stopped.
  if (player && player.carId === null && !player.dead) {
    if (Math.hypot(player.x - aheadX, player.y - aheadY) < 46) {
      throttle = Math.abs(car.speed) > 30 ? -0.6 : 0;
    }
  }
  if (car.wait > 0) {
    car.wait -= dt;
    throttle = 0;
  }
  stepCar(car, dt, throttle, steer, city, cars, events);
  // Traffic never speeds: cap it well under the model's top speed.
  const cap = 165;
  if (car.speed > cap) car.speed = cap;
}

/** Keep the traffic count up and recycle cars the player left far behind. */
export function updateTraffic(world, dt, events) {
  const { random, city, cars } = world;
  const px = world.player.x;
  const py = world.player.y;
  let count = 0;
  for (const car of cars) {
    if (car.driver !== 'traffic') continue;
    count += 1;
    if (Math.hypot(car.x - px, car.y - py) > 1500) {
      const fresh = spawnTrafficCar(random, px, py);
      Object.assign(car, fresh, { id: car.id });
    } else {
      driveTraffic(car, dt, random, cars, city, events, world.player);
    }
  }
  // Stolen traffic is replaced, so the streets never empty out.
  while (count < TRAFFIC_COUNT) {
    cars.push(spawnTrafficCar(random, px, py));
    count += 1;
  }
  return count;
}
