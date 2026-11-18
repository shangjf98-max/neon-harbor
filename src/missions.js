// The story of Neon Harbor: four missions for Mara, the garage owner who gives
// Rook — new in town, broke, good behind a wheel — a way up. Each mission is a
// chain of objectives; the world checks them every step and hands out the
// reward, the banner and the next briefing when one completes.

import { blockCentre } from './city.js';

const GARAGE_TALK = { x: 816, y: 2450 }; // Mara, outside her garage office (block 1,4)
const GARAGE_DRIVE = { x: 816, y: 2608 }; // the street in front of the garage
const WAREHOUSE_YARD = { x: 2352, y: 950 }; // warehouse yard (block 4,1)
const WAREHOUSE_DRIVE = { x: 2352, y: 1072 }; // the street in front of Warehouse 9
const PLAZA = { x: 1792, y: 1792 }; // the plaza fountain (block 3,3)

export const MISSION_DEFS = [
  {
    title: 'First Wheels',
    giver: 'Mara',
    brief:
      'Rook, you want work in this town, you need wheels. There is a sedan parked by my garage — take it, bring it round, and say hello properly.',
    reward: 150,
    steps: [
      { kind: 'reach', x: 580, y: 2200, radius: 70, text: 'Get to the sedan parked by the garage' },
      { kind: 'enterCar', car: 'sedan', text: 'Get in the sedan (E)' },
      { kind: 'deliver', x: GARAGE_DRIVE.x, y: GARAGE_DRIVE.y, radius: 90, text: 'Drive the sedan to Mara\'s garage' },
      { kind: 'reach', x: GARAGE_TALK.x, y: GARAGE_TALK.y, radius: 55, onFoot: true, text: 'Get out and talk to Mara' },
    ],
  },
  {
    title: 'Harbor Run',
    giver: 'Mara',
    brief:
      'A van full of "spare parts" needs to reach Warehouse 9 before the lunch rush. Ninety seconds. The cops love this route, so drive like you mean it.',
    reward: 300,
    timed: 90,
    steps: [
      { kind: 'enterCar', car: 'van', text: 'Get in the delivery van by the garage' },
      { kind: 'deliver', x: WAREHOUSE_DRIVE.x, y: WAREHOUSE_DRIVE.y, radius: 110, text: 'Deliver the van to Warehouse 9 — beat the clock!' },
    ],
  },
  {
    title: 'Rough Crowd',
    giver: 'Mara',
    brief:
      'The warehouse crew has been leaning on my drivers. Go over there and change their minds. Fists only — I do not want this loud.',
    reward: 400,
    steps: [
      { kind: 'reach', x: WAREHOUSE_YARD.x, y: WAREHOUSE_YARD.y, radius: 160, text: 'Go to Warehouse 9' },
      { kind: 'defeat', count: 3, text: 'Deal with the warehouse crew (Space to punch)' },
      { kind: 'reach', x: GARAGE_TALK.x, y: GARAGE_TALK.y, radius: 55, onFoot: true, text: 'Report back to Mara' },
    ],
  },
  {
    title: 'The Getaway',
    giver: 'Mara',
    brief:
      'A yellow Comet is sitting pretty by the plaza fountain, and its owner is not. Take it, shake the cops, and bring it home. Do not scratch it. Much.',
    reward: 600,
    steps: [
      { kind: 'enterCar', car: 'sports', text: 'Steal the yellow sports car at the plaza' },
      { kind: 'evade', text: 'Lose the cops — get clear and stay hidden until the heat dies down' },
      { kind: 'deliver', x: GARAGE_DRIVE.x, y: GARAGE_DRIVE.y, radius: 90, text: 'Deliver the Comet to Mara\'s garage' },
    ],
  },
];

export function createMissions() {
  return {
    index: 0, // the active mission, or MISSION_DEFS.length when the story is done
    step: 0,
    done: [],
    thugsLeft: 3,
    earned: 0,
    timer: 0, // counts down for timed missions
    failed: false,
    evadeArmed: false, // the getaway's evade step only counts once the heat is on
    banner: null, // {title, sub, time} shown by the HUD
    bannerTime: 0,
  };
}

/** The active mission definition, or null when the story is complete. */
export function activeMission(missions) {
  return missions.index < MISSION_DEFS.length ? MISSION_DEFS[missions.index] : null;
}

/** The active objective, or null. */
export function activeStep(missions) {
  const def = activeMission(missions);
  return def ? def.steps[missions.step] : null;
}

/** Where the marker points: the active objective's target, or null while evading. */
export function missionMarker(world) {
  const step = activeStep(world.missions);
  if (!step) return { x: GARAGE_TALK.x, y: GARAGE_TALK.y, label: "Mara's Garage" };
  if (step.kind === 'defeat') return { x: WAREHOUSE_YARD.x, y: WAREHOUSE_YARD.y, label: 'Warehouse 9' };
  if (step.kind === 'evade') return null;
  if (step.kind === 'enterCar') {
    const car = world.cars.find((c) => c.missionCar === step.car);
    if (car) return { x: car.x, y: car.y, label: step.text };
  }
  return { x: step.x, y: step.y, label: step.text };
}

function showBanner(missions, title, sub) {
  missions.banner = { title, sub };
  missions.bannerTime = 5;
}

/** The warehouse crew, back on their feet: a fresh crew for the fight, and a
 *  crew that recovers once it is over, so early brawls never soft-lock it. */
function reviveCrew(world) {
  for (const ped of world.peds) {
    if (ped.thug) {
      ped.state = 'walk';
      ped.hp = 68;
      ped.downTime = 0;
      ped.aggro = false;
    }
  }
  world.missions.thugsLeft = 3;
}

function completeMission(world, events) {
  const def = MISSION_DEFS[world.missions.index];
  world.player.money += def.reward;
  world.missions.earned += def.reward;
  world.missions.done.push(world.missions.index);
  world.missions.index += 1;
  world.missions.step = 0;
  world.missions.timer = 0;
  world.missions.failed = false;
  world.missions.thugsLeft = 3;
  events.push({ type: 'missionDone', x: world.player.x, y: world.player.y });
  const next = activeMission(world.missions);
  if (def.title === 'Rough Crowd') reviveCrew(world);
  if (next) {
    if (next.title === 'Rough Crowd') reviveCrew(world);
    showBanner(world.missions, `MISSION COMPLETE: ${def.title}`, `+$${def.reward} — Mara is pleased.`);
    events.push({ type: 'briefing', title: next.title, brief: next.brief });
  } else {
    showBanner(world.missions, 'STORY COMPLETE', `+$${def.reward} — Neon Harbor is yours, Rook. Keep the engine warm.`);
  }
}

function failMission(world, reason) {
  const missions = world.missions;
  missions.step = 0;
  missions.timer = 0;
  missions.failed = true;
  showBanner(missions, 'MISSION FAILED', reason);
}

/** Advance one objective step when its condition is met. */
function stepSatisfied(world, step) {
  const player = world.player;
  const car = world.cars.find((c) => c.id === player.carId) || null;
  switch (step.kind) {
    case 'reach': {
      if (step.onFoot && player.carId !== null) return false;
      return Math.hypot(player.x - step.x, player.y - step.y) < step.radius;
    }
    case 'enterCar': {
      if (!car) return false;
      if (step.car === 'sedan') return car.missionCar === 'sedan';
      if (step.car === 'van') return car.missionCar === 'van';
      if (step.car === 'sports') return car.missionCar === 'sports';
      return false;
    }
    case 'deliver': {
      if (!car) return false;
      return Math.hypot(player.x - step.x, player.y - step.y) < step.radius && Math.abs(car.speed) < 40;
    }
    case 'defeat':
      return world.missions.thugsLeft <= 0;
    case 'evade':
      return world.wanted === 0 && world.missions.evadeArmed;
    default:
      return false;
  }
}

export function updateMissions(world, dt, events) {
  const missions = world.missions;
  if (missions.bannerTime > 0) missions.bannerTime -= dt;
  const def = activeMission(missions);
  if (!def) return;
  const step = def.steps[missions.step];
  if (!step) return;

  // The getaway arms its evade step the moment the heat is on.
  if (def.title === 'The Getaway' && missions.step === 1 && world.wanted > 0) {
    missions.evadeArmed = true;
  }
  if (missions.timer > 0) {
    missions.timer -= dt;
    if (missions.timer <= 0) {
      failMission(world, 'The delivery was late. Mara is giving you one more shot.');
      return;
    }
  }
  if (stepSatisfied(world, step)) {
    missions.step += 1;
    if (step.kind === 'enterCar' && def.title === 'The Getaway') {
      // Stealing the Comet brings the heat at once.
      world.wanted = Math.max(world.wanted, 3);
      events.push({ type: 'wanted', x: world.player.x, y: world.player.y, stars: world.wanted });
    }
    // The timed run starts its clock the moment the van is taken.
    if (def.timed && missions.step === 1) {
      missions.timer = def.timed;
      missions.failed = false;
    }
    if (missions.step >= def.steps.length) {
      completeMission(world, events);
    } else {
      events.push({ type: 'objective', x: world.player.x, y: world.player.y });
    }
  }
}

/** The mission list for the Tab panel: every mission with its status. */
export function missionList(missions) {
  return MISSION_DEFS.map((def, i) => ({
    title: def.title,
    giver: def.giver,
    reward: def.reward,
    status: missions.done.includes(i) ? 'done' : i === missions.index ? 'active' : i < missions.index ? 'done' : 'locked',
    brief: def.brief,
  }));
}

export const LANDMARKS = { GARAGE: GARAGE_TALK, GARAGE_DRIVE, WAREHOUSE: WAREHOUSE_YARD, WAREHOUSE_DRIVE, PLAZA, STATION: blockCentre(2, 2), HOSPITAL: blockCentre(4, 4) };
