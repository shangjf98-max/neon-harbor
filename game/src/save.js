// Save and load through localStorage. The save holds the player's position,
// health and money, the mission progress, the cars that matter and the world
// seed, so a continued game rebuilds the same city and resumes where it left
// off. Storage failures (private windows) are swallowed: the game still plays.

import { SAVE_KEY } from './config.js';

const VERSION = 1;

/** Snapshot the parts of the world a save needs. */
export function snapshot(world) {
  const p = world.player;
  return {
    version: VERSION,
    seed: world.seed,
    savedAt: Date.now(),
    player: { x: p.x, y: p.y, angle: p.angle, hp: p.hp, money: p.money },
    missions: {
      index: world.missions.index,
      step: world.missions.step,
      done: [...world.missions.done],
      thugsLeft: world.missions.thugsLeft,
      earned: world.missions.earned,
    },
    cars: world.cars
      .filter((c) => c.keep)
      .map((c) => ({ id: c.id, model: c.model, x: c.x, y: c.y, angle: c.angle, hp: c.hp, stolen: c.stolen })),
    playerCarId: p.carId,
    playTime: world.playTime,
  };
}

export function saveGame(world) {
  try {
    window.localStorage.setItem(SAVE_KEY, JSON.stringify(snapshot(world)));
    return true;
  } catch {
    return false;
  }
}

export function loadSave() {
  try {
    const raw = window.localStorage.getItem(SAVE_KEY);
    if (!raw) return null;
    const data = JSON.parse(raw);
    if (data.version !== VERSION || typeof data.seed !== 'number') return null;
    return data;
  } catch {
    return null;
  }
}

export function hasSave() {
  return loadSave() !== null;
}

export function clearSave() {
  try {
    window.localStorage.removeItem(SAVE_KEY);
  } catch {
    // Nothing stored, nothing to clear.
  }
}
