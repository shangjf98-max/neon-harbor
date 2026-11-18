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
  // Appear at an intersection some distance off, never on top of the player
  // and never inside the hide radius: a cruiser spawning 500px away vetoes
  // a clean breakaway the player just earned, and pops into view on screen.
  const spots = [];
  for (const x of WORLD.roadCentres) {
    for (const y of WORLD.roadCentres) {
      const d = Math.hypot(x - player.x, y - player.y);
      if (d > 750 && d < 1300) spots.push({ x, y });
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
  let throttle = 0.95;
  let ringSeeking = false; // in ring mode and still travelling to its post
  const playerDist = Math.hypot(player.x - car.x, player.y - car.y);
  if (player.carId === null) {
    // Closing on a player on foot: shed speed early, so the car stops beside
    // them instead of arriving at full tilt and running them down before the
    // bust can land. A sprinting player still outruns the approach.
    const cap = Math.max(0, (playerDist - 36) * 1.4);
    if (car.speed > cap) throttle = -1;
    else if (playerDist < 120) throttle = Math.min(throttle, 0.35);
    if (playerDist < 26) throttle = Math.min(throttle, -0.4);
  } else if (playerDist < 150) {
    // Containing a driver: hold a ring around the car instead of piling onto
    // it. Cruisers converging on one point wedge the player against walls and
    // world edges with no way out; the ring keeps the pressure on while
    // always leaving room to drive away.
    //
    // Each cruiser owns a fixed post on the ring, spread by the golden angle
    // over cruiser ids: a post derived from the cruiser's current bearing
    // slides around the ring as it moves, and the cruiser orbits the player
    // instead of ever settling. The post must also be inside the world, out
    // of solids, and reachable by a straight drive — at a harbour edge the
    // raw post sits across the water, and greedy steering grinds the cruiser
    // against the basin forever.
    if (car.ringAngle === undefined) car.ringAngle = (car.id * 2.399963229) % (Math.PI * 2);
    const postAt = (a) => ({
      x: player.x + Math.cos(a) * 150,
      y: player.y + Math.sin(a) * 150,
    });
    const inWorld = (p) => p.x >= 40 && p.x <= WORLD.size - 40 && p.y >= 40 && p.y <= WORLD.size - 40;
    const pathClear = (p) => {
      const d = Math.hypot(p.x - car.x, p.y - car.y);
      const n = Math.max(1, Math.ceil(d / 30));
      for (let k = 1; k <= n; k += 1) {
        const t = k / n;
        if (!world.city.freeAt(car.x + (p.x - car.x) * t, car.y + (p.y - car.y) * t, 24)) return false;
      }
      return true;
    };
    // A post counts only at its full ring radius: clamping an out-of-world
    // post onto the map edge collapses it onto the player in a corner, and
    // the cruiser then sits on the player's bumper instead of holding the ring.
    // The drive to the post must also stay clear of the player's car: a post
    // on the far side sends the cruiser straight through the player, and the
    // repeated contact bulldozes a stopped car down the street.
    const postOk = (p) => {
      if (!inWorld(p) || !world.city.freeAt(p.x, p.y, 30) || !pathClear(p)) return false;
      if (playerDist >= 55) {
        const segX = p.x - car.x;
        const segY = p.y - car.y;
        const segLen2 = segX * segX + segY * segY;
        const t = segLen2 === 0 ? 0 : Math.max(0, Math.min(1, ((player.x - car.x) * segX + (player.y - car.y) * segY) / segLen2));
        const nearX = car.x + segX * t;
        const nearY = car.y + segY * t;
        if (Math.hypot(player.x - nearX, player.y - nearY) < 55) return false;
      }
      return true;
    };
    // Search the ring around the cruiser's own post, widening the ring when
    // the corner geometry leaves no room at 150px: at a harbour corner the
    // reachable arc is a thin crescent, and a wider ring finds open road.
    // If nothing is reachable anywhere, fall back to the clamped post and
    // let the stuck recovery do what it can.
    let post = null;
    const offsets = [0, Math.PI / 6, -Math.PI / 6, Math.PI / 3, -Math.PI / 3, Math.PI / 2, -Math.PI / 2, Math.PI];
    for (const radius of [150, 200, 260]) {
      for (const off of offsets) {
        const alt = {
          x: player.x + Math.cos(car.ringAngle + off) * radius,
          y: player.y + Math.sin(car.ringAngle + off) * radius,
        };
        if (postOk(alt)) {
          post = alt;
          break;
        }
      }
      if (post) break;
    }
    if (!post) {
      const raw = postAt(car.ringAngle);
      post = {
        x: Math.max(40, Math.min(WORLD.size - 40, raw.x)),
        y: Math.max(40, Math.min(WORLD.size - 40, raw.y)),
      };
    }
    {
      const rdx = post.x - car.x;
      const rdy = post.y - car.y;
      const rDist = Math.hypot(rdx, rdy);
      const rAngle = Math.atan2(rdy, rdx);
      let rDiff = rAngle - car.angle;
      while (rDiff > Math.PI) rDiff -= Math.PI * 2;
      while (rDiff < -Math.PI) rDiff += Math.PI * 2;
      steer = Math.max(-1, Math.min(1, rDiff * 2.4));
      if (rDist < 14) {
        throttle = 0;
      } else if (Math.abs(rDiff) < 1.2) {
        throttle = Math.min(0.6, rDist * 0.02);
        ringSeeking = true;
      } else {
        // The ring point is behind: back toward it, steering reversed.
        throttle = -0.6;
        steer = -steer;
        ringSeeking = true;
      }
    }
    if (playerDist < 70) {
      // Too close: get clear of the player's car instead of shoving it. A
      // cruiser grinding into the player's door wedges it against whatever
      // solid is behind it, and the shove always wins the pushing match.
      // Move away from the player in whichever direction the nose allows:
      // reversing while facing away would drive straight into them.
      const awayAngle = Math.atan2(car.y - player.y, car.x - player.x);
      let aDiff = awayAngle - car.angle;
      while (aDiff > Math.PI) aDiff -= Math.PI * 2;
      while (aDiff < -Math.PI) aDiff += Math.PI * 2;
      if (Math.abs(aDiff) < Math.PI / 2) {
        throttle = 0.6;
        steer = Math.max(-1, Math.min(1, aDiff * 2.4));
      } else {
        throttle = -0.6;
        steer = -Math.max(-1, Math.min(1, aDiff * 2.4));
      }
      ringSeeking = true;
    }
  }
  // Stuck against a wall: back up and swing around. A cruiser counts as stuck
  // when it is slow while driving forward, or while travelling to its ring
  // post in either direction — ring mode's capped throttle never reaches the
  // forward-only test, so without this a boxed cruiser never tries to escape.
  // Braking toward a player on foot is not stuck: the bust needs the cruiser
  // to hold still beside them.
  if (Math.abs(car.speed) < 25 && (throttle > 0.5 || ringSeeking)) {
    car.stuckTime = (car.stuckTime || 0) + dt;
  } else {
    car.stuckTime = 0;
  }
  if (car.stuckTime > 1.2) {
    throttle = -0.8;
    // Swing the wheel both ways while backing out: a fixed lock just spins
    // the car in place when it is boxed in on three sides.
    const side = car.stuckSteer || (car.stuckSteer = world.random() < 0.5 ? -1 : 1);
    steer = (Math.floor(world.time * 2.4) % 2 === 0 ? 1 : -1) * side;
    if (car.stuckTime > 2.6) {
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
