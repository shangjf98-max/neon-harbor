// Neon Harbor: every tuning number, colour and key in one place. The world is a
// fixed 3072x3072 city; the renderer draws a camera window over it, so no rule
// below depends on the screen size.

/** The simulation's fixed step, in seconds: 60 updates a second whatever the display's rate. */
export const STEP = 1 / 60;

/** The city: 7 roads each way (centres 48 + i*512) and 6x6 blocks of 416px between them. */
export const WORLD = {
  size: 3072,
  pitch: 512,
  road: 96,
  roadCentres: [48, 560, 1072, 1584, 2096, 2608, 3024],
  blocks: 6,
  blockOrigin: 96,
  blockSize: 416,
};

export const PLAYER = {
  radius: 13,
  walk: 235,
  sprint: 340,
  hp: 100,
  punchRange: 40,
  punchArc: 1.1,
  punchDamage: 34,
  punchCooldown: 0.42,
  regenDelay: 5,
  regenRate: 9,
};

/** Wanted level: how crimes add stars, how hiding sheds them, how the bust timer works. */
export const WANTED = {
  steal: 1,
  assault: 1,
  hitPedestrian: 2,
  hitPolice: 1,
  hideRadius: 700,
  decayDelay: 10,
  decayEvery: 9,
  bustRadius: 70,
  bustTime: 2.2,
  bustFine: 150,
  wastedFine: 100,
};

export const TRAFFIC_COUNT = 14;
export const PEDESTRIAN_COUNT = 26;
export const PARKED_COUNT = 10;
export const CASH_PICKUP_COUNT = 10;
export const CASH_PICKUP_VALUE = 20;

/** Sun-soaked modern city palette: warm sand, pastel buildings, teal harbour water. */
export const PALETTE = {
  ground: '#cdbb92',
  sidewalk: '#e6dcc0',
  sidewalkEdge: '#c9b98f',
  road: '#4c4c55',
  roadEdge: '#3a3a42',
  lane: '#f2e6b8',
  crosswalk: '#d8d2c2',
  park: '#79b265',
  parkDark: '#5f9a50',
  tree: '#3e7d3a',
  treeDark: '#2f6130',
  water: '#3d9db5',
  waterDeep: '#2b7f98',
  sand: '#e8d9a8',
  dock: '#a9805a',
  dockDark: '#8a6a48',
  plaza: '#ddd3b8',
  buildingRoof: ['#e8a87c', '#e9c46a', '#8ecae6', '#f4a7b9', '#b5c99a', '#d9b8e6', '#f2d492', '#a8dadc'],
  buildingWall: ['#f0e2c8', '#e8d5b5', '#dfe8e2', '#f2ddd3', '#e4e0cf', '#e8dcc8'],
  windowLit: '#ffe9a8',
  windowDark: '#5a6b7d',
  shadow: 'rgba(60, 40, 20, 0.28)',
  police: '#f2f2f2',
  policeTrim: '#2b4c9b',
  text: '#f5f1e6',
  muted: '#cfc7ae',
  panel: 'rgba(20, 18, 24, 0.78)',
  panelEdge: 'rgba(245, 225, 160, 0.35)',
  gold: '#ffd166',
  money: '#7be495',
  danger: '#ff6b6b',
  health: '#6ee7a0',
  star: '#ffd166',
  marker: '#ffd166',
};

export const FONT = 'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif';

/** Where the save game is kept between visits (this browser only). */
export const SAVE_KEY = 'neon-harbor.save.v1';

/** Ranks by missions completed, shown on the title and pause screens. */
export const RANKS = ['Newcomer', 'Wheelman', 'Runner', 'Enforcer', 'Harbor Legend'];
