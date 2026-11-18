// The screenshot scenes behind ?shot=start|drive|chase|mission. Each one plays
// the real rules forward from a fresh world for a fixed number of steps, steered
// by a simple autopilot, so the frame is what real play looks like and the same
// seed always stages the same scene. Nothing here draws anything special: the
// shots are the game itself, a few seconds in.

import { STEP } from './config.js';
import { resetWorld, stepWorld } from './world.js';
import { ACTION_PUNCH } from './input.js';
import { SCREEN_PLAY, SCREEN_TITLE } from './render.js';

/** A scripted input source: the autopilot fills in drive/move vectors per step. */
function scriptedInput() {
  return {
    drive: { throttle: 0, steer: 0, handbrake: false },
    move: { x: 0, y: 0 },
    moveVector() {
      return this.move;
    },
    driveVector() {
      return this.drive;
    },
    sprinting() {
      return false;
    },
  };
}

/** Steer a car toward a waypoint: fast on the straights, braked into turns. */
function steerToward(car, target) {
  const dx = target.x - car.x;
  const dy = target.y - car.y;
  const dist = Math.hypot(dx, dy);
  const targetAngle = Math.atan2(dy, dx);
  let diff = targetAngle - car.angle;
  while (diff > Math.PI) diff -= Math.PI * 2;
  while (diff < -Math.PI) diff += Math.PI * 2;
  const steer = Math.max(-1, Math.min(1, diff * 2.4));
  // At full speed the turn radius is wider than the road, so brake for corners.
  const speed = Math.abs(car.speed);
  let desired = 360;
  if (dist < 300 || Math.abs(diff) > 0.5) desired = 150;
  let throttle = 0.1;
  if (speed < desired) throttle = 0.85;
  else if (speed > desired + 50) throttle = -0.7;
  return { throttle, steer, handbrake: false };
}

/** Put the player in a car, as if they had just stepped in. */
function seatPlayer(world, car) {
  car.driver = 'player';
  car.parked = false;
  car.speed = 0;
  world.player.carId = car.id;
  world.player.x = car.x;
  world.player.y = car.y;
  world.player.angle = car.angle;
  world.camera.x = car.x;
  world.camera.y = car.y;
}

/** Drive a loop of waypoints for `seconds`, staying rolling for the shot. */
function driveLoop(world, input, waypoints, seconds) {
  let next = 0;
  let stuck = 0;
  let reversing = 0;
  const steps = Math.floor(seconds / STEP);
  for (let i = 0; i < steps; i += 1) {
    const car = world.cars.find((c) => c.id === world.player.carId);
    const target = waypoints[next];
    if (Math.hypot(target.x - car.x, target.y - car.y) < 130) next = (next + 1) % waypoints.length;
    input.drive = steerToward(car, waypoints[next]);
    // Wedged against something (a shove from a police car, a parked car):
    // back up for a moment, then carry on.
    if (Math.abs(car.speed) < 25 && input.drive.throttle > 0.5) stuck += 1;
    else stuck = 0;
    if (stuck > 60) {
      reversing = 48;
      stuck = 0;
    }
    if (reversing > 0) {
      reversing -= 1;
      input.drive = { throttle: -0.8, steer: 0.6, handbrake: false };
    }
    stepWorld(world, STEP, input, 0, null);
  }
  // A few steps with the same input so the camera settles without stopping the car.
  for (let i = 0; i < 6; i += 1) stepWorld(world, STEP, input, 0, null);
}

const DOWNTOWN_LOOP = [
  { x: 2096, y: 1072 },
  { x: 2096, y: 2096 },
  { x: 1072, y: 2096 },
  { x: 1072, y: 1072 },
];

// The chase loop runs on the roads around the plaza, axis-aligned all the way.
const CHASE_LOOP = [
  { x: 2096, y: 1584 },
  { x: 2096, y: 1072 },
  { x: 1072, y: 1072 },
  { x: 1072, y: 1584 },
];

/**
 * Set `world` to the named scene and return the screen to draw over it.
 * Unknown names stage the title, like the starter's scenes do.
 */
export function stageShot(name, world) {
  const input = scriptedInput();
  resetWorld(world);
  if (name === 'drive') {
    const sedan = world.cars.find((c) => c.missionCar === 'sedan');
    sedan.x = 1200;
    sedan.y = 1072;
    sedan.angle = 0;
    seatPlayer(world, sedan);
    driveLoop(world, input, DOWNTOWN_LOOP, 7);
    return { screen: SCREEN_PLAY };
  }
  if (name === 'chase') {
    const sports = world.cars.find((c) => c.missionCar === 'sports');
    sports.x = 1200;
    sports.y = 1584;
    sports.angle = 0;
    seatPlayer(world, sports);
    world.missions.index = 3;
    world.missions.step = 1;
    world.missions.done = [0, 1, 2];
    world.missions.evadeArmed = true;
    world.wanted = 3;
    driveLoop(world, input, CHASE_LOOP, 8);
    return { screen: SCREEN_PLAY };
  }
  if (name === 'mission') {
    world.missions.index = 2;
    world.missions.step = 1;
    world.missions.done = [0, 1];
    world.missions.thugsLeft = 3;
    world.player.x = 2350;
    world.player.y = 1010;
    world.player.angle = -Math.PI / 2;
    world.camera.x = 2350;
    world.camera.y = 950;
    const steps = Math.floor(3.2 / STEP);
    for (let i = 0; i < steps; i += 1) {
      // Walk at the nearest standing thug, and swing when in reach.
      let nearest = null;
      let nearestD = Infinity;
      for (const ped of world.peds) {
        if (!ped.thug || ped.state === 'down') continue;
        const d = Math.hypot(ped.x - world.player.x, ped.y - world.player.y);
        if (d < nearestD) {
          nearestD = d;
          nearest = ped;
        }
      }
      let actions = 0;
      if (nearest) {
        const dx = nearest.x - world.player.x;
        const dy = nearest.y - world.player.y;
        const d = Math.hypot(dx, dy) || 1;
        input.move = nearestD > 30 ? { x: dx / d, y: dy / d } : { x: 0, y: 0 };
        if (nearestD < 44) actions = ACTION_PUNCH;
      }
      stepWorld(world, STEP, input, actions, null);
    }
    return { screen: SCREEN_PLAY };
  }
  // start: a few seconds of city life behind the title.
  const steps = Math.floor(4 / STEP);
  for (let i = 0; i < steps; i += 1) stepWorld(world, STEP, input, 0, null);
  return { screen: SCREEN_TITLE };
}
