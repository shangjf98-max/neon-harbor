// Save and load through localStorage. The save holds the player's position,
// health and money, the mission progress, the cars that matter and the world
// seed, so a continued game rebuilds the same city and resumes where it left
// off. Storage failures (private windows) are swallowed: the game still plays.

import { PLAYER, SAVE_KEY, WORLD } from './config.js';
import { MISSION_DEFS } from './missions.js';

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
      .map((c) => ({ id: c.id, model: c.model, x: c.x, y: c.y, angle: c.angle, hp: c.hp, stolen: c.stolen, missionCar: c.missionCar ?? null })),
    playerCarId: p.carId,
    playTime: world.playTime,
    // Which warehouse thugs were down, so the fight resumes as it was.
    thugs: world.peds.filter((x) => x.thug).map((x) => x.state === 'down'),
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

/** A finite number inside the given bounds, or nothing. */
function isNum(v, min, max) {
  return typeof v === 'number' && Number.isFinite(v) && v >= min && v <= max;
}

/** Load and fully validate a save. Anything malformed loads as nothing, so a
 *  damaged save falls back to a new game instead of a broken one. */
export function loadSave() {
  try {
    const raw = window.localStorage.getItem(SAVE_KEY);
    if (!raw) return null;
    const data = JSON.parse(raw);
    if (!data || typeof data !== 'object') return null;
    if (data.version !== VERSION || !isNum(data.seed, -1e9, 1e9)) return null;
    const p = data.player;
    if (!p || typeof p !== 'object') return null;
    if (!isNum(p.x, 0, WORLD.size) || !isNum(p.y, 0, WORLD.size)) return null;
    if (!isNum(p.angle, -1e6, 1e6) || !isNum(p.hp, 0, PLAYER.hp) || !isNum(p.money, 0, 1e9)) return null;
    const m = data.missions;
    if (!m || typeof m !== 'object') return null;
    if (!Number.isInteger(m.index) || m.index < 0 || m.index > MISSION_DEFS.length) return null;
    if (!Number.isInteger(m.step) || m.step < 0) return null;
    if (m.index < MISSION_DEFS.length && m.step >= MISSION_DEFS[m.index].steps.length) return null;
    if (!Array.isArray(m.done) || m.done.some((d) => !Number.isInteger(d) || d < 0 || d >= MISSION_DEFS.length)) return null;
    if (!Number.isInteger(m.thugsLeft) || m.thugsLeft < 0 || m.thugsLeft > 3) return null;
    if (!isNum(m.earned, 0, 1e9)) return null;
    if (!Array.isArray(data.cars)) return null;
    for (const c of data.cars) {
      if (!c || typeof c !== 'object') return null;
      if (!isNum(c.x, 0, WORLD.size) || !isNum(c.y, 0, WORLD.size) || !isNum(c.angle, -1e6, 1e6) || !isNum(c.hp, 0, 100)) return null;
    }
    if (data.playerCarId !== null && data.playerCarId !== undefined && typeof data.playerCarId !== 'number') return null;
    if (!isNum(data.playTime ?? 0, 0, 1e9)) return null;
    if (data.thugs !== undefined && (!Array.isArray(data.thugs) || data.thugs.some((t) => typeof t !== 'boolean'))) return null;
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
