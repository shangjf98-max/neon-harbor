// Neon Harbor itself: the road grid, the blocks between the roads, the buildings
// and props inside them, and the collision shapes the rest of the game asks
// about. Generation is deterministic for a seed: the same seed builds the same
// city, so a saved game always loads onto the city it was saved in.

import { PALETTE, WORLD } from './config.js';
import { pick, range, rangeInt } from './random.js';

/** Block kinds, by (column, row): landmarks are fixed, the rest is drawn from the seed. */
function blockKind(col, row, random) {
  if (row === 5) return 'harbor';
  if (col === 2 && row === 2) return 'station';
  if (col === 1 && row === 4) return 'garage';
  if (col === 4 && row === 1) return 'warehouse';
  if (col === 4 && row === 4) return 'hospital';
  if ((col === 0 && row === 0) || (col === 5 && row === 0)) return 'park';
  if (col === 3 && row === 3) return 'plaza';
  return random() < 0.12 ? 'park' : 'buildings';
}

export function blockRect(col, row) {
  return {
    x: WORLD.blockOrigin + col * WORLD.pitch,
    y: WORLD.blockOrigin + row * WORLD.pitch,
    w: WORLD.blockSize,
    h: WORLD.blockSize,
  };
}

/** The centre of a block, in world coordinates. */
export function blockCentre(col, row) {
  const r = blockRect(col, row);
  return { x: r.x + r.w / 2, y: r.y + r.h / 2 };
}

/** Whether a point is on a road (within half a road width of a road centre line). */
export function onRoad(x, y) {
  for (const c of WORLD.roadCentres) {
    if (Math.abs(x - c) <= WORLD.road / 2 || Math.abs(y - c) <= WORLD.road / 2) return true;
  }
  return false;
}

/** The nearest point on a road centre line, for snapping spawns onto the street. */
export function nearestRoadPoint(x, y) {
  let best = null;
  let bestD = Infinity;
  for (const cx of WORLD.roadCentres) {
    for (const cy of WORLD.roadCentres) {
      const d = (x - cx) * (x - cx) + (y - cy) * (y - cy);
      if (d < bestD) {
        bestD = d;
        best = { x: cx, y: cy };
      }
    }
  }
  return best;
}

function circleHitsRect(x, y, r, rect) {
  const cx = Math.max(rect.x, Math.min(x, rect.x + rect.w));
  const cy = Math.max(rect.y, Math.min(y, rect.y + rect.h));
  const dx = x - cx;
  const dy = y - cy;
  return dx * dx + dy * dy < r * r;
}

export function createCity(random) {
  // Nothing solid may reach the road bands, with room for a car's nose: the
  // last block row and column run to the world edge, past the last road's
  // band, so unclamped solids there wall off the ring roads (the harbour
  // basins blocked the south road outright, and east-edge buildings left
  // the east road impassable). The clearance is 40px past the band edge,
  // not just the band itself: a car hugging the band's edge swings its
  // front circle 34px past its centre, and a basin 6px off the band still
  // grinds it to a halt mid-turn (the M4 evade flake of round 5).
  const SOLID_LIMIT = WORLD.size - WORLD.road - 40;
  const blocks = [];
  const solids = []; // AABBs nothing may pass through: buildings, crates, walls, water.
  const trees = []; // {x, y, r, shade}: drawn in parks, solid as circles.
  const lamps = []; // {x, y}: street lamps along the roads, drawn only.
  const crates = []; // {x, y, w, h, hue}: drawn crates, also in solids.
  const benches = []; // {x, y, angle}: park benches, drawn only.

  for (let row = 0; row < WORLD.blocks; row += 1) {
    for (let col = 0; col < WORLD.blocks; col += 1) {
      const rect = blockRect(col, row);
      const kind = blockKind(col, row, random);
      const block = { col, row, kind, rect, buildings: [], water: null, label: null, sign: null };
      const inset = 26; // sidewalk ring
      if (kind === 'buildings') {
        // Two by two buildings with alleys between them, heights and colours from the seed.
        const cells = rangeInt(random, 2, 4);
        const positions =
          cells === 4
            ? [
                [0, 0],
                [1, 0],
                [0, 1],
                [1, 1],
              ]
            : cells === 3
              ? [
                  [0, 0],
                  [1, 0],
                  [0, 1],
                ]
              : [
                  [0, 0],
                  [1, 1],
                ];
        for (const [gx, gy] of positions) {
          const w = range(random, 130, 170);
          const h = range(random, 130, 170);
          const bx = rect.x + inset + gx * (rect.w - inset * 2 - w);
          const by = rect.y + inset + gy * (rect.h - inset * 2 - h);
          const b = {
            x: Math.min(bx, rect.x + rect.w - inset - w, SOLID_LIMIT - w),
            y: Math.min(by, rect.y + rect.h - inset - h, SOLID_LIMIT - h),
            w,
            h,
            height: rangeInt(random, 1, 3),
            roof: pick(random, PALETTE.buildingRoof),
            wall: pick(random, PALETTE.buildingWall),
            lit: random() < 0.5,
          };
          block.buildings.push(b);
          solids.push({ x: b.x, y: b.y, w: b.w, h: b.h });
        }
      } else if (kind === 'park') {
        const count = rangeInt(random, 7, 11);
        for (let i = 0; i < count; i += 1) {
          trees.push({
            x: Math.min(range(random, rect.x + 40, rect.x + rect.w - 40), SOLID_LIMIT - 30),
            y: Math.min(range(random, rect.y + 40, rect.y + rect.h - 40), SOLID_LIMIT - 30),
            r: range(random, 16, 26),
            shade: random() < 0.5,
          });
        }
        benches.push({ x: rect.x + rect.w / 2, y: rect.y + rect.h / 2 - 30, angle: 0 });
        benches.push({ x: rect.x + rect.w / 2, y: rect.y + rect.h / 2 + 34, angle: Math.PI });
      } else if (kind === 'plaza') {
        const count = rangeInt(random, 4, 6);
        for (let i = 0; i < count; i += 1) {
          trees.push({
            x: Math.min(range(random, rect.x + 50, rect.x + rect.w - 50), SOLID_LIMIT - 30),
            y: Math.min(range(random, rect.y + 50, rect.y + rect.h - 50), SOLID_LIMIT - 30),
            r: range(random, 14, 20),
            shade: false,
          });
        }
        // A fountain at the centre: solid, and a landmark drivers steer around.
        const f = { x: rect.x + rect.w / 2 - 34, y: rect.y + rect.h / 2 - 34, w: 68, h: 68 };
        solids.push(f);
        block.fountain = f;
      } else if (kind === 'harbor') {
        // A water basin along the block's south edge, docks and crates around
        // it. The basin stops short of the ring roads: its old footprint ran
        // to the world edge and walled off the south road between intersections.
        block.water = {
          x: rect.x + 10,
          y: Math.min(rect.y + rect.h - 150, SOLID_LIMIT - 140),
          w: Math.min(rect.w - 20, SOLID_LIMIT - (rect.x + 10)),
          h: 140,
        };
        solids.push({ ...block.water });
        const n = rangeInt(random, 3, 5);
        for (let i = 0; i < n; i += 1) {
          const c = {
            x: range(random, rect.x + 30, Math.min(rect.x + rect.w - 70, SOLID_LIMIT - 70)),
            y: range(random, rect.y + 30, block.water.y - 70),
            w: range(random, 26, 40),
            h: range(random, 26, 40),
            hue: pick(random, ['#b5854d', '#8a9a5b', '#7d8aa0']),
          };
          crates.push(c);
          solids.push({ x: c.x, y: c.y, w: c.w, h: c.h });
        }
        block.boat = { x: block.water.x + block.water.w * 0.3, y: block.water.y + 50, angle: 0.2 };
      } else if (kind === 'station' || kind === 'garage' || kind === 'warehouse' || kind === 'hospital') {
        const b = {
          x: rect.x + 70,
          y: rect.y + 60,
          w: rect.w - 140,
          h: rect.h - 190,
          height: kind === 'warehouse' ? 1 : 2,
          roof: kind === 'station' ? '#3f6fb5' : kind === 'garage' ? '#c05746' : kind === 'warehouse' ? '#8d99ae' : '#e8e8e8',
          wall: kind === 'hospital' ? '#f2f2f2' : '#e6dcc0',
          lit: false,
        };
        block.buildings.push(b);
        solids.push({ x: b.x, y: b.y, w: b.w, h: b.h });
        block.label =
          kind === 'station'
            ? 'POLICE'
            : kind === 'garage'
              ? "MARA'S GARAGE"
              : kind === 'warehouse'
                ? 'WAREHOUSE 9'
                : 'HOSPITAL';
        if (kind === 'warehouse') {
          for (let i = 0; i < 4; i += 1) {
            const c = {
              x: rect.x + 40 + i * 90,
              y: rect.y + rect.h - 70,
              w: 34,
              h: 34,
              hue: '#b5854d',
            };
            crates.push(c);
            solids.push({ x: c.x, y: c.y, w: c.w, h: c.h });
          }
        }
      }
      blocks.push(block);
    }
  }

  // Street lamps at every intersection corner, alternating sides.
  for (const cx of WORLD.roadCentres) {
    for (const cy of WORLD.roadCentres) {
      lamps.push({ x: cx + WORLD.road / 2 + 6, y: cy - WORLD.road / 2 - 6 });
    }
  }

  /** Push a circle out of every solid it overlaps; returns true when it moved. */
  function collideCircle(x, y, r) {
    let moved = false;
    for (const s of solids) {
      if (!circleHitsRect(x, y, r, s)) continue;
      const cx = Math.max(s.x, Math.min(x, s.x + s.w));
      const cy = Math.max(s.y, Math.min(y, s.y + s.h));
      let dx = x - cx;
      let dy = y - cy;
      let d = Math.hypot(dx, dy);
      if (d === 0) {
        // Centre inside the rect: push out along the smallest penetration.
        const left = x - s.x;
        const right = s.x + s.w - x;
        const top = y - s.y;
        const bottom = s.y + s.h - y;
        const m = Math.min(left, right, top, bottom);
        if (m === left) x = s.x - r;
        else if (m === right) x = s.x + s.w + r;
        else if (m === top) y = s.y - r;
        else y = s.y + s.h + r;
      } else {
        dx /= d;
        dy /= d;
        x = cx + dx * r;
        y = cy + dy * r;
      }
      d = 0;
      moved = true;
    }
    for (const t of trees) {
      const dx = x - t.x;
      const dy = y - t.y;
      const d = Math.hypot(dx, dy);
      const min = r + t.r * 0.35;
      if (d < min && d > 0) {
        x = t.x + (dx / d) * min;
        y = t.y + (dy / d) * min;
        moved = true;
      }
    }
    x = Math.max(r, Math.min(WORLD.size - r, x));
    y = Math.max(r, Math.min(WORLD.size - r, y));
    return { x, y, moved };
  }

  /** Whether a circle at (x, y) is free of solids, without resolving. */
  function freeAt(x, y, r) {
    for (const s of solids) if (circleHitsRect(x, y, r, s)) return false;
    return x >= r && y >= r && x <= WORLD.size - r && y <= WORLD.size - r;
  }

  /** A sidewalk loop around one block, for pedestrians: inset corners, walked in order. */
  function sidewalkLoop(col, row) {
    const rect = blockRect(col, row);
    const m = 14;
    // Harbor blocks hold water along the south edge: the loop's south side
    // stays north of the basin, or walkers tread water forever.
    const block = blocks.find((b) => b.col === col && b.row === row);
    const bottom = block && block.water ? block.water.y - 20 : rect.y + rect.h - m;
    return [
      { x: rect.x + m, y: rect.y + m },
      { x: rect.x + rect.w - m, y: rect.y + m },
      { x: rect.x + rect.w - m, y: bottom },
      { x: rect.x + m, y: bottom },
    ];
  }

  return { blocks, solids, trees, lamps, crates, benches, collideCircle, freeAt, sidewalkLoop };
}
