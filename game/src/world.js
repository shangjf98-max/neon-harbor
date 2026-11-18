// The world: one state object, built from a seed, advanced one fixed step at a
// time. It owns the city, the player, the cars, the pedestrians, the wanted
// level, the missions and the effects, and it turns the subsystems' events
// into state changes. The renderer and the screens read it; they never write it.

import { CASH_PICKUP_COUNT, PARKED_COUNT, PEDESTRIAN_COUNT, PLAYER, TRAFFIC_COUNT, WANTED, WORLD } from './config.js';
import { createRandom, pick, range, rangeInt } from './random.js';
import { blockRect, createCity } from './city.js';
import { createPlayer, damagePlayer, enterCar, exitCar, nearestCar, updatePlayer } from './player.js';
import { MODELS, createCar, resetCarIds, stepCar } from './vehicles.js';
import { spawnTrafficCar, updateTraffic } from './traffic.js';
import { createPedestrian, spawnPedestrian, updatePedestrian } from './pedestrians.js';
import { checkCarPedestrianHits, checkCarPlayerHits, resolvePunch, updatePickups } from './combat.js';
import { addWanted, applyBusted, applyWasted, updatePolice } from './police.js';
import { LANDMARKS, MISSION_DEFS, activeStep, createMissions, updateMissions } from './missions.js';
import { ACTION_INTERACT, ACTION_PUNCH } from './input.js';

export function createWorld(seed) {
  const world = {
    seed,
    random: createRandom(seed),
    city: null,
    player: null,
    cars: [],
    peds: [],
    pickups: [],
    particles: [],
    skids: [],
    wanted: 0,
    wantedTimer: 0,
    hideTimer: 0,
    bustTimer: 0,
    spawnTimer: 0,
    nearestPolice: Infinity,
    sirenOn: false,
    missions: createMissions(),
    stats: { stolen: 0, knockedOut: 0, distance: 0 },
    camera: { x: 0, y: 0 },
    time: 0,
    playTime: 0,
    shake: 0,
    lastFine: 0,
    pendingEnd: null,
    healTimer: 0,
    saveTimer: 0,
    mara: { x: LANDMARKS.GARAGE.x, y: LANDMARKS.GARAGE.y - 20 },
  };
  resetWorld(world);
  return world;
}

/** (Re)build everything from the world's seed: a fresh game, or a loaded one before its save is applied. */
export function resetWorld(world) {
  const random = createRandom(world.seed);
  world.random = random;
  // Car ids restart too, so the same seed hands out the same ids: saves match cars by id.
  resetCarIds();
  world.city = createCity(random);
  world.cars = [];
  world.peds = [];
  world.pickups = [];
  world.particles = [];
  world.skids = [];
  world.wanted = 0;
  world.wantedTimer = 0;
  world.hideTimer = 0;
  world.bustTimer = 0;
  world.spawnTimer = 0;
  world.nearestPolice = Infinity;
  world.sirenOn = false;
  world.missions = createMissions();
  world.stats = { stolen: 0, knockedOut: 0, distance: 0 };
  world.time = 0;
  world.playTime = 0;
  world.shake = 0;
  world.lastFine = 0;
  world.pendingEnd = null;
  world.healTimer = 0;
  world.saveTimer = 0;

  // Rook starts on the sidewalk by Mara's garage, facing the street.
  world.player = createPlayer(700, 2160);
  world.player.angle = Math.PI;
  world.camera = { x: 700, y: 2160 };

  // Mission 1's sedan is Mara's to lend, and the van is her delivery van.
  const sedan = createCar('sedan', 580, 2200, Math.PI / 2, '#c94f4f');
  sedan.parked = true;
  sedan.owned = true;
  sedan.keep = true;
  sedan.missionCar = 'sedan';
  world.cars.push(sedan);
  const van = createCar('van', 580, 2420, Math.PI / 2, '#e8e8e8');
  van.parked = true;
  van.owned = true;
  van.keep = true;
  van.missionCar = 'van';
  world.cars.push(van);
  const sports = createCar('sports', 1560, 1840, 0, '#ffd166');
  sports.parked = true;
  sports.keep = true;
  sports.missionCar = 'sports';
  world.cars.push(sports);

  // Parked cars along the roads, for the taking. Re-roll any spot that
  // would overlap a mission car, so the story cars are never buried.
  const models = ['sedan', 'sedan', 'taxi', 'van', 'sedan', 'truck'];
  for (let i = 0; i < PARKED_COUNT; i += 1) {
    let x = 0;
    let y = 0;
    let vertical = true;
    for (let tries = 0; tries < 20; tries += 1) {
      vertical = random() < 0.5;
      const centre = pick(random, WORLD.roadCentres);
      const along = range(random, 200, WORLD.size - 200);
      const edge = (random() < 0.5 ? -1 : 1) * (WORLD.road / 2 - 18);
      x = vertical ? centre + edge : along;
      y = vertical ? along : centre + edge;
      if (!world.cars.some((c) => Math.hypot(c.x - x, c.y - y) < 80)) break;
    }
    const model = pick(random, models);
    const car = createCar(model, x, y, vertical ? Math.PI / 2 : 0, pick(random, MODELS[model].colors));
    car.parked = true;
    world.cars.push(car);
  }

  // Traffic and pedestrians.
  for (let i = 0; i < TRAFFIC_COUNT; i += 1) world.cars.push(spawnTrafficCar(random, 700, 2160));
  for (let i = 0; i < PEDESTRIAN_COUNT; i += 1) world.peds.push(spawnPedestrian(random, world.city));

  // The warehouse crew: three thugs lounging in the yard, on open ground
  // south of the warehouse building and north of the yard crates.
  const crew = [
    { x: 2280, y: 930 },
    { x: 2380, y: 930 },
    { x: 2480, y: 930 },
  ];
  for (const spot of crew) {
    const thug = createPedestrian(spot.x, spot.y, Math.PI / 2, { hp: 68, thug: true, shirt: '#3a3f4a', skin: '#c68642' });
    thug.downTime = 0;
    world.peds.push(thug);
  }

  // Cash lying around the sidewalks.
  for (let i = 0; i < CASH_PICKUP_COUNT; i += 1) {
    const col = rangeInt(random, 0, WORLD.blocks - 1);
    const row = rangeInt(random, 0, WORLD.blocks - 1);
    const loop = world.city.sidewalkLoop(col, row);
    const at = pick(random, loop);
    world.pickups.push({ x: at.x + range(random, -20, 20), y: at.y + range(random, -20, 20), amount: 20, life: 9999, bob: random() * 6 });
  }
}

/** Apply a loaded save onto a freshly reset world. The data is already
 *  validated by loadSave; this still clamps defensively and never throws. */
export function applySave(world, data) {
  const p = world.player;
  p.x = Math.max(0, Math.min(WORLD.size, data.player.x));
  p.y = Math.max(0, Math.min(WORLD.size, data.player.y));
  p.angle = data.player.angle;
  // A save at zero health loads the player alive: death is not a save state.
  p.hp = Math.max(1, Math.min(PLAYER.hp, data.player.hp));
  p.money = data.player.money;
  p.dead = false;
  world.missions.index = data.missions.index;
  world.missions.step = data.missions.step;
  world.missions.done = [...data.missions.done];
  world.missions.thugsLeft = data.missions.thugsLeft;
  world.missions.earned = data.missions.earned;
  world.playTime = data.playTime || 0;
  // The evade step is never loaded armed: hiding must be re-earned after a load.
  world.missions.evadeArmed = false;
  world.missions.failed = false;
  // A timed delivery restarts its clock at full time on load.
  const def = MISSION_DEFS[world.missions.index];
  if (def && def.timed && world.missions.step === 1) world.missions.timer = def.timed;
  // Restore which warehouse thugs were down.
  if (Array.isArray(data.thugs)) {
    const thugs = world.peds.filter((x) => x.thug);
    data.thugs.forEach((down, i) => {
      const thug = thugs[i];
      if (!thug || !down) return;
      thug.state = 'down';
      thug.hp = 0;
      thug.downTime = 9999;
    });
  }
  // Restore the kept cars; the rest of the traffic is re-rolled by the seed.
  // Mission cars match by their story role, other cars by id.
  for (const saved of data.cars) {
    const car =
      (saved.missionCar && world.cars.find((c) => c.missionCar === saved.missionCar)) || world.cars.find((c) => c.id === saved.id);
    if (car) {
      car.x = saved.x;
      car.y = saved.y;
      car.angle = saved.angle;
      car.hp = Math.max(saved.hp, car.missionCar ? 20 : 0);
      car.stolen = Boolean(saved.stolen);
      car.keep = true;
      car.parked = true;
      car.speed = 0;
      car.driver = 'none';
    }
  }
  if (data.playerCarId) {
    const car = world.cars.find((c) => c.id === data.playerCarId);
    if (car) {
      car.driver = 'player';
      car.parked = false;
      p.carId = car.id;
    }
  }
  // Never load the player inside a wall.
  const res = world.city.collideCircle(p.x, p.y, PLAYER.radius);
  p.x = res.x;
  p.y = res.y;
  world.camera = { x: p.x, y: p.y };
}

/** Spawn a burst of particles at a point. */
export function burst(world, x, y, color, count, size, life) {
  for (let i = 0; i < count; i += 1) {
    const angle = world.random() * Math.PI * 2;
    const speed = 30 + world.random() * 90;
    world.particles.push({
      x,
      y,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      size: size * (0.6 + world.random() * 0.8),
      life: life * (0.6 + world.random() * 0.7),
      maxLife: life,
      color,
      alpha: 0.9,
    });
  }
}

/** One fixed step of the whole simulation. Returns the events for sound and messages. */
export function stepWorld(world, dt, input, actions, audio) {
  const events = [];
  const player = world.player;
  const prevX = player.x;
  const prevY = player.y;
  world.time += dt;
  world.playTime += dt;
  world.saveTimer += dt;
  if (world.shake > 0) world.shake = Math.max(0, world.shake - dt * 2.2);

  // One-shot actions.
  if (actions & ACTION_PUNCH) resolvePunch(world, events);
  if (actions & ACTION_INTERACT) {
    if (player.carId !== null) {
      exitCar(world, events);
    } else {
      const car = nearestCar(world, 56);
      if (car) {
        const wasStolen = car.stolen;
        enterCar(world, car, events);
        if (!wasStolen && car.stolen) world.stats.stolen += 1;
      }
    }
  }

  updatePlayer(world, dt, input, events);

  // Driving: the player's car takes the drive input.
  const car = world.cars.find((c) => c.id === player.carId);
  if (car) {
    const drive = input.driveVector();
    const prevCarX = car.x;
    const prevCarY = car.y;
    car.skid = 0;
    const res = stepCar(car, dt, drive.throttle, drive.steer, world.city, world.cars, events);
    if (drive.handbrake) car.speed *= 1 - Math.min(1, dt * 3);
    if (car.skid && Math.abs(car.speed) > 200) {
      world.skids.push({ x1: prevCarX, y1: prevCarY, x2: car.x, y2: car.y, life: 6, maxLife: 6 });
      if (world.skids.length > 220) world.skids.splice(0, world.skids.length - 220);
    }
    player.x = car.x;
    player.y = car.y;
    player.angle = car.angle;
    world.stats.distance += res.moved;
    // Dust kicked up at speed.
    if (Math.abs(car.speed) > 350 && world.random() < 0.3) {
      world.particles.push({
        x: car.x - Math.cos(car.angle) * 24,
        y: car.y - Math.sin(car.angle) * 24,
        vx: (world.random() - 0.5) * 40,
        vy: (world.random() - 0.5) * 40,
        size: 5,
        life: 0.5,
        maxLife: 0.5,
        color: 'rgba(210, 190, 150, A)',
        alpha: 0.5,
      });
    }
  }

  updateTraffic(world, dt, events);
  for (const ped of world.peds) updatePedestrian(ped, dt, world, events);
  checkCarPedestrianHits(world, events);
  checkCarPlayerHits(world, events);
  updatePolice(world, dt, events);
  updateMissions(world, dt, events);
  updatePickups(world, dt, events);

  // The hospital heals anyone who walks its grounds.
  const hospital = blockRect(4, 4);
  if (
    player.carId === null &&
    player.x > hospital.x &&
    player.x < hospital.x + hospital.w &&
    player.y > hospital.y &&
    player.y < hospital.y + hospital.h &&
    player.hp < PLAYER.hp
  ) {
    player.hp = Math.min(PLAYER.hp, player.hp + 22 * dt);
    world.healTimer -= dt;
    if (world.healTimer <= 0) {
      world.healTimer = 2;
      events.push({ type: 'heal', x: player.x, y: player.y });
    }
  }

  // Player velocity, for the pursuit lead and the bust check.
  player.vx = (player.x - prevX) / dt;
  player.vy = (player.y - prevY) / dt;

  // Particles and skid marks age.
  for (let i = world.particles.length - 1; i >= 0; i -= 1) {
    const p = world.particles[i];
    p.life -= dt;
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    p.vx *= 1 - dt * 3;
    p.vy *= 1 - dt * 3;
    if (p.life <= 0) world.particles.splice(i, 1);
  }
  for (let i = world.skids.length - 1; i >= 0; i -= 1) {
    world.skids[i].life -= dt;
    if (world.skids[i].life <= 0) world.skids.splice(i, 1);
  }

  // Camera: follow with a look-ahead, clamped to the world.
  const lookX = player.x + (player.vx || 0) * 0.35;
  const lookY = player.y + (player.vy || 0) * 0.35;
  world.camera.x += (lookX - world.camera.x) * Math.min(1, dt * 4);
  world.camera.y += (lookY - world.camera.y) * Math.min(1, dt * 4);

  // Fold the events into state changes, in the order they happened.
  for (let i = 0; i < events.length; i += 1) {
    const e = events[i];
    if (e.type === 'crime') {
      addWanted(world, WANTED[e.kind] || 1, events);
    } else if (e.type === 'crash') {
      world.shake = Math.min(1, world.shake + (e.hard ? 0.7 : 0.3));
      burst(world, e.x, e.y, 'rgba(255, 220, 120, A)', e.hard ? 10 : 5, 3, 0.4);
    } else if (e.type === 'thugPunch') {
      damagePlayer(world, 8, e.x, e.y, events);
    } else if (e.type === 'hit' || e.type === 'punch') {
      burst(world, e.x, e.y, 'rgba(255, 220, 120, A)', 6, 3, 0.3);
    } else if (e.type === 'knockdown') {
      world.stats.knockedOut += 1;
      burst(world, e.x, e.y, 'rgba(255, 255, 255, A)', 8, 3, 0.4);
    } else if (e.type === 'busted') {
      world.lastFine = Math.min(player.money, WANTED.bustFine);
      applyBusted(world);
      world.pendingEnd = 'busted';
    } else if (e.type === 'wasted') {
      world.lastFine = Math.min(player.money, WANTED.wastedFine);
      applyWasted(world);
      world.pendingEnd = 'wasted';
    } else if (e.type === 'cash') {
      burst(world, e.x, e.y, 'rgba(123, 228, 149, A)', 6, 3, 0.4);
    }
  }

  // Loops: engine follows the driven car, siren follows the chase.
  if (audio) {
    const driven = world.cars.find((c) => c.id === player.carId);
    audio.engine(driven ? Math.abs(driven.speed) / 560 : 0, Boolean(driven));
    audio.siren(world.sirenOn);
  }
  return events;
}

/** The prompt line for the HUD: what E or Space would do right now. */
export function currentPrompt(world) {
  const player = world.player;
  if (player.carId !== null) {
    const step = activeStep(world.missions);
    const car = world.cars.find((c) => c.id === player.carId);
    if (step && step.kind === 'deliver' && car && Math.abs(car.speed) >= 40 && Math.hypot(player.x - step.x, player.y - step.y) < step.radius * 1.5) {
      return 'Slow down to deliver';
    }
    return 'E — Get out    Space — Handbrake';
  }
  const car = nearestCar(world, 56);
  if (car) return car.owned ? 'E — Get in the car' : 'E — Steal the car';
  const step = activeStep(world.missions);
  if (step && step.kind === 'defeat') return 'Space / Click — Punch';
  return null;
}
