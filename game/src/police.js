// The wanted level and the Neon Harbor police: stars earned by crime, police
// cars that spawn and chase, the bust when they corner the player on foot, and
// the slow cool-down when the player breaks line of sight and hides.

import { WANTED, WORLD } from './config.js';
import { onRoad } from './city.js';
import { pick } from './random.js';
import { createCar, stepCar } from './vehicles.js';

export function addWanted(world, stars, events) {
  const before = world.wanted;
  world.wanted = Math.max(0, Math.min(5, world.wanted + stars));
  if (world.wanted > before) {
    world.wantedTimer = 0;
    world.hideTimer = 0;
    events.push({ type: 'wanted', x: world.player.x, y: world.player.y, stars: world.wanted });
  }
}

/** How many police cars the current wanted level fields. Exported for unit tests. */
export function policeTarget(wanted) {
  return wanted === 0 ? 0 : Math.min(5, wanted + (wanted >= 3 ? 1 : 0));
}

function spawnPolice(world) {
  const { random, player } = world;
  // Appear at an intersection some distance off, never on top of the player.
  const spots = [];
  for (const x of WORLD.roadCentres) {
    for (const y of WORLD.roadCentres) {
      const d = Math.hypot(x - player.x, y - player.y);
      if (d > 480 && d < 1300) spots.push({ x, y });
    }
  }
  const at = spots.length > 0 ? pick(random, spots) : { x: WORLD.roadCentres[3], y: WORLD.roadCentres[3] };
  const car = createCar('police', at.x, at.y, Math.atan2(player.y - at.y, player.x - at.x));
  car.driver = 'police';
  car.hp = 100;
  world.cars.push(car);
  return car;
}

/** Pursuit steering: follow the road grid toward the player, ram when close. Exported for unit tests. */
export function pursuitTarget(car, player) {
  const dist = Math.hypot(player.x - car.x, player.y - car.y);
  const centres = WORLD.roadCentres;
  const near = (v) => centres.reduce((a, b) => (Math.abs(b - v) < Math.abs(a - v) ? b : a));
  // Ram straight at the player only when they are on a road or close enough
  // that no building can be in the way; otherwise head for the grid point
  // nearest them, so the chase stays on the streets.
  if (dist < 200 && (dist < 110 || onRoad(player.x, player.y))) return { x: player.x, y: player.y };
  if (dist < 200) return { x: near(player.x), y: near(player.y) };
  const onV = Math.abs(car.x - near(car.x)) < 42;
  const onH = Math.abs(car.y - near(car.y)) < 42;
  if (onV && !onH) return { x: near(car.x), y: near(player.y) };
  if (onH && !onV) return { x: near(player.x), y: near(car.y) };
  if (onV && onH) {
    // At an intersection: take the neighbouring one that closes on the player.
    // Neighbours are measured from the snapped centre, not the car's offset spot,
    // so the target stays exactly on the grid.
    const step = WORLD.pitch;
    const cx = near(car.x);
    const cy = near(car.y);
    const options = [
      { x: cx + step, y: cy },
      { x: cx - step, y: cy },
      { x: cx, y: cy + step },
      { x: cx, y: cy - step },
    ].filter((p) => p.x >= 0 && p.x <= WORLD.size && p.y >= 0 && p.y <= WORLD.size);
    let best = options[0];
    let bestD = Infinity;
    for (const p of options) {
      const d = Math.abs(p.x - player.x) + Math.abs(p.y - player.y);
      if (d < bestD) {
        bestD = d;
        best = p;
      }
    }
    return best;
  }
  // Off the roads (shoved onto a sidewalk): head for the nearest intersection.
  return { x: near(car.x), y: near(car.y) };
}

function pursue(car, dt, world, events) {
  const player = world.player;
  const target = pursuitTarget(car, player);
  const dx = target.x - car.x;
  const dy = target.y - car.y;
  const dist = Math.hypot(dx, dy);
  const targetAngle = Math.atan2(dy, dx);
  let diff = targetAngle - car.angle;
  while (diff > Math.PI) diff -= Math.PI * 2;
  while (diff < -Math.PI) diff += Math.PI * 2;
  let steer = Math.max(-1, Math.min(1, diff * 2.4));
  // Ease off only when about to overshoot a slow player on foot.
  let throttle = 0.95;
  const playerDist = Math.hypot(player.x - car.x, player.y - car.y);
  if (playerDist < 60 && player.carId === null) throttle = 0.25;
  if (playerDist < 26 && player.carId === null) throttle = -0.4;
  // Stuck against a wall: back up and swing around.
  if (Math.abs(car.speed) < 25 && throttle > 0.5) {
    car.stuckTime = (car.stuckTime || 0) + dt;
  } else {
    car.stuckTime = 0;
  }
  if (car.stuckTime > 1.2) {
    throttle = -0.8;
    steer = car.stuckSteer || (car.stuckSteer = world.random() < 0.5 ? -1 : 1);
    if (car.stuckTime > 2.2) {
      car.stuckTime = 0;
      car.stuckSteer = 0;
    }
  }
  stepCar(car, dt, throttle, steer, world.city, world.cars, events);
  // Police never dawdle: keep a floor under their speed while closing.
  if (playerDist > 220 && Math.abs(car.speed) < 200 && car.stuckTime < 1.2) car.speed = 200 * Math.sign(car.speed || 1);
}

export function updatePolice(world, dt, events) {
  const player = world.player;
  let police = world.cars.filter((c) => c.driver === 'police');

  // Spawn up to the wanted level's target, one per second at most.
  world.spawnTimer = (world.spawnTimer || 0) - dt;
  if (world.wanted > 0 && police.length < policeTarget(world.wanted) && world.spawnTimer <= 0) {
    spawnPolice(world);
    world.spawnTimer = 1.2;
  }
  // Wanted cleared: the police give up and drive away (despawn at range).
  if (world.wanted === 0) {
    for (let i = world.cars.length - 1; i >= 0; i -= 1) {
      const car = world.cars[i];
      if (car.driver === 'police' && Math.hypot(car.x - player.x, car.y - player.y) > 900) {
        world.cars.splice(i, 1);
      }
    }
  } else {
    // Stars shed: surplus cars peel off once they are far from the player.
    const target = policeTarget(world.wanted);
    for (let i = world.cars.length - 1; i >= 0; i -= 1) {
      const car = world.cars[i];
      if (
        car.driver === 'police' &&
        world.cars.filter((c) => c.driver === 'police').length > target &&
        Math.hypot(car.x - player.x, car.y - player.y) > 900
      ) {
        world.cars.splice(i, 1);
      }
    }
  }
  police = world.cars.filter((c) => c.driver === 'police');

  let nearest = Infinity;
  let nearestCar = null;
  for (const car of police) {
    pursue(car, dt, world, events);
    const d = Math.hypot(car.x - player.x, car.y - player.y);
    if (d < nearest) {
      nearest = d;
      nearestCar = car;
    }
  }
  world.nearestPolice = nearestCar ? nearest : Infinity;
  world.sirenOn = world.wanted > 0 && police.length > 0 && nearest < 900;

  // The bust: cornered on foot, slow, a police car at arm's length.
  if (world.wanted > 0 && player.carId === null && !player.dead) {
    const playerSpeed = Math.hypot(player.vx || 0, player.vy || 0);
    if (nearest < WANTED.bustRadius && playerSpeed < 40) {
      world.bustTimer += dt;
      if (world.bustTimer >= WANTED.bustTime) {
        world.bustTimer = 0;
        events.push({ type: 'busted', x: player.x, y: player.y });
      }
    } else {
      world.bustTimer = Math.max(0, world.bustTimer - dt * 2);
    }
  } else {
    world.bustTimer = 0;
  }

  // Hiding: no police car in sight for a while sheds a star at a time.
  if (world.wanted > 0) {
    if (nearest > WANTED.hideRadius) {
      world.hideTimer += dt;
      if (world.hideTimer > WANTED.decayDelay) {
        world.wantedTimer += dt;
        if (world.wantedTimer >= WANTED.decayEvery) {
          world.wantedTimer = 0;
          world.wanted -= 1;
          events.push({ type: 'wanted', x: player.x, y: player.y, stars: world.wanted });
        }
      }
    } else {
      world.hideTimer = 0;
      world.wantedTimer = 0;
    }
  }
}

/** A bust or a death in the middle of the getaway's evade step sends the
 *  player back to steal the Comet again: the heat is gone, so the evade
 *  must be re-earned instead of completing for free. */
function resetEvadeStep(world) {
  if (world.missions.index === 3 && world.missions.step === 1) {
    world.missions.step = 0;
    world.missions.evadeArmed = false;
  }
}

/** Apply the bust: fine, clean record, and a walk of shame from the station. */
export function applyBusted(world) {
  const player = world.player;
  player.money = Math.max(0, player.money - WANTED.bustFine);
  player.hp = 100;
  player.dead = false;
  world.wanted = 0;
  world.bustTimer = 0;
  resetEvadeStep(world);
  // The station is block (2,2): respawn on the street in front of it.
  player.x = 1328;
  player.y = 1570;
  player.angle = Math.PI / 2;
  if (player.carId !== null) {
    const car = world.cars.find((c) => c.id === player.carId);
    if (car) {
      car.driver = 'none';
      car.parked = true;
      car.speed = 0;
    }
    player.carId = null;
  }
  for (let i = world.cars.length - 1; i >= 0; i -= 1) {
    if (world.cars[i].driver === 'police') world.cars.splice(i, 1);
  }
}

/** Apply being wasted: fine, clean record, and a fresh start at the hospital. */
export function applyWasted(world) {
  const player = world.player;
  player.money = Math.max(0, player.money - WANTED.wastedFine);
  player.hp = 100;
  player.dead = false;
  world.wanted = 0;
  resetEvadeStep(world);
  player.x = 2352;
  player.y = 2580;
  player.angle = -Math.PI / 2;
  if (player.carId !== null) {
    const car = world.cars.find((c) => c.id === player.carId);
    if (car) {
      car.driver = 'none';
      car.parked = true;
      car.speed = 0;
    }
    player.carId = null;
  }
  for (let i = world.cars.length - 1; i >= 0; i -= 1) {
    if (world.cars[i].driver === 'police') world.cars.splice(i, 1);
  }
}
