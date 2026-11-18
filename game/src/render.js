// The renderer: the camera, the city painted from the generated data, the
// entities in depth order, the weather of effects (skids, dust, smoke), the
// warm sun-soaked light, and the screens (title, pause, busted, wasted). The
// HUD and minimap are drawn by their own modules, after the world.

import { FONT, PALETTE, RANKS, WORLD } from './config.js';
import { drawCar, roundRect, shade } from './vehicles.js';
import { drawPedestrian } from './pedestrians.js';
import { drawPlayer } from './player.js';
import { drawPickups } from './combat.js';
import { drawMinimap } from './minimap.js';
import { drawHUD } from './hud.js';
import { missionMarker } from './missions.js';

export const SCREEN_TITLE = 0;
export const SCREEN_PLAY = 1;
export const SCREEN_PAUSED = 2;
export const SCREEN_BUSTED = 3;
export const SCREEN_WASTED = 4;

export function createRenderer(canvas) {
  const ctx = canvas.getContext('2d');
  let viewW = 1280;
  let viewH = 720;

  function resize(w, h) {
    viewW = w;
    viewH = h;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
    canvas.style.width = `${w}px`;
    canvas.style.height = `${h}px`;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  function drawGround(cam) {
    ctx.fillStyle = PALETTE.ground;
    ctx.fillRect(0, 0, viewW, viewH);
    // Roads: asphalt bands along every centre line, only the visible ones.
    ctx.fillStyle = PALETTE.road;
    for (const c of WORLD.roadCentres) {
      const vx = c - WORLD.road / 2 - cam.x;
      if (vx < viewW && vx + WORLD.road > 0) ctx.fillRect(vx, -cam.y, WORLD.road, WORLD.size);
      const hy = c - WORLD.road / 2 - cam.y;
      if (hy < viewH && hy + WORLD.road > 0) ctx.fillRect(-cam.x, hy, WORLD.size, WORLD.road);
    }
    // Lane dashes, clipped to the visible stretch of each road (phase kept from d = 0).
    ctx.fillStyle = PALETTE.lane;
    const dash = 34;
    const gap = 30;
    const step = dash + gap;
    for (const c of WORLD.roadCentres) {
      const vx = c - 3 - cam.x;
      if (vx > -8 && vx < viewW) {
        const d0 = Math.max(0, Math.floor(cam.y / step) * step);
        for (let d = d0; d < cam.y + viewH + step && d < WORLD.size; d += step) {
          ctx.fillRect(vx, d - cam.y, 6, dash);
        }
      }
      const hy = c - 3 - cam.y;
      if (hy > -8 && hy < viewH) {
        const d0 = Math.max(0, Math.floor(cam.x / step) * step);
        for (let d = d0; d < cam.x + viewW + step && d < WORLD.size; d += step) {
          ctx.fillRect(d - cam.x, hy, dash, 6);
        }
      }
    }
    // Crosswalks at every visible intersection.
    ctx.fillStyle = PALETTE.crosswalk;
    for (const cx of WORLD.roadCentres) {
      if (cx - cam.x < -WORLD.road || cx - cam.x > viewW + WORLD.road) continue;
      for (const cy of WORLD.roadCentres) {
        if (cy - cam.y < -WORLD.road || cy - cam.y > viewH + WORLD.road) continue;
        for (let i = -2; i <= 2; i += 1) {
          ctx.fillRect(cx + i * 14 - 5 - cam.x, cy - WORLD.road / 2 + 8 - cam.y, 9, 14);
          ctx.fillRect(cx + i * 14 - 5 - cam.x, cy + WORLD.road / 2 - 22 - cam.y, 9, 14);
        }
      }
    }
  }

  function drawBlock(block, cam) {
    const r = block.rect;
    const x = r.x - cam.x;
    const y = r.y - cam.y;
    if (x > viewW || y > viewH || x + r.w < 0 || y + r.h < 0) return;
    // Sidewalk ring.
    ctx.fillStyle = PALETTE.sidewalk;
    ctx.fillRect(x, y, r.w, r.h);
    ctx.strokeStyle = PALETTE.sidewalkEdge;
    ctx.lineWidth = 2;
    ctx.strokeRect(x + 1, y + 1, r.w - 2, r.h - 2);
    if (block.kind === 'park') {
      ctx.fillStyle = PALETTE.park;
      ctx.fillRect(x + 24, y + 24, r.w - 48, r.h - 48);
      ctx.fillStyle = PALETTE.parkDark;
      for (let i = 0; i < 5; i += 1) {
        ctx.beginPath();
        ctx.arc(x + 60 + i * 70, y + 60 + ((i * 37) % 200), 26, 0, Math.PI * 2);
        ctx.fill();
      }
    } else if (block.kind === 'plaza') {
      ctx.fillStyle = PALETTE.plaza;
      ctx.fillRect(x + 24, y + 24, r.w - 48, r.h - 48);
      ctx.strokeStyle = 'rgba(120, 100, 60, 0.3)';
      ctx.lineWidth = 1;
      for (let i = 1; i < 6; i += 1) {
        ctx.beginPath();
        ctx.moveTo(x + 24 + (i * (r.w - 48)) / 6, y + 24);
        ctx.lineTo(x + 24 + (i * (r.w - 48)) / 6, y + r.h - 24);
        ctx.moveTo(x + 24, y + 24 + (i * (r.h - 48)) / 6);
        ctx.lineTo(x + r.w - 24, y + 24 + (i * (r.h - 48)) / 6);
        ctx.stroke();
      }
      if (block.fountain) {
        const f = block.fountain;
        ctx.fillStyle = '#b8c4c8';
        ctx.beginPath();
        ctx.arc(f.x + f.w / 2 - cam.x, f.y + f.h / 2 - cam.y, 34, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = PALETTE.water;
        ctx.beginPath();
        ctx.arc(f.x + f.w / 2 - cam.x, f.y + f.h / 2 - cam.y, 26, 0, Math.PI * 2);
        ctx.fill();
      }
    } else if (block.kind === 'harbor') {
      ctx.fillStyle = PALETTE.sand;
      ctx.fillRect(x + 24, y + 24, r.w - 48, r.h - 48);
      if (block.water) {
        const w = block.water;
        ctx.fillStyle = PALETTE.water;
        ctx.fillRect(w.x - cam.x, w.y - cam.y, w.w, w.h);
        ctx.fillStyle = PALETTE.waterDeep;
        for (let i = 0; i < 6; i += 1) {
          ctx.fillRect(w.x + 10 + i * 60 - cam.x, w.y + 20 + (i % 3) * 40 - cam.y, 44, 5);
        }
        // Dock planks along the water's north edge.
        ctx.fillStyle = PALETTE.dock;
        ctx.fillRect(w.x - cam.x, w.y - 12 - cam.y, w.w, 12);
        ctx.strokeStyle = PALETTE.dockDark;
        for (let i = 0; i < w.w; i += 24) {
          ctx.beginPath();
          ctx.moveTo(w.x + i - cam.x, w.y - 12 - cam.y);
          ctx.lineTo(w.x + i - cam.x, w.y - cam.y);
          ctx.stroke();
        }
        if (block.boat) {
          ctx.save();
          ctx.translate(block.boat.x - cam.x, block.boat.y - cam.y);
          ctx.rotate(block.boat.angle);
          ctx.fillStyle = '#e8e8e8';
          roundRect(ctx, -34, -10, 68, 20, 9);
          ctx.fill();
          ctx.fillStyle = '#c05746';
          ctx.fillRect(-12, -7, 24, 14);
          ctx.restore();
        }
      }
    }
    // Buildings: shadow, walls, roof, window grid, and the landmark sign.
    for (const b of block.buildings) {
      const bx = b.x - cam.x;
      const by = b.y - cam.y;
      const lift = b.height * 7;
      ctx.fillStyle = PALETTE.shadow;
      ctx.fillRect(bx + 10, by + 12, b.w, b.h);
      ctx.fillStyle = shade(b.wall, -14);
      ctx.fillRect(bx + 4, by + 5, b.w, b.h);
      ctx.fillStyle = b.wall;
      ctx.fillRect(bx, by, b.w, b.h);
      // Roof inset.
      ctx.fillStyle = b.roof;
      ctx.fillRect(bx + 8, by + 8, b.w - 16, b.h - 16);
      ctx.fillStyle = shade(b.roof, -20);
      ctx.fillRect(bx + 8, by + 8, b.w - 16, 6);
      // Rooftop clutter: vents and a skylight, so roofs read as roofs.
      ctx.fillStyle = shade(b.roof, -34);
      ctx.fillRect(bx + b.w * 0.22, by + b.h * 0.3, 18, 14);
      ctx.fillRect(bx + b.w * 0.62, by + b.h * 0.58, 14, 18);
      ctx.fillStyle = 'rgba(220, 240, 250, 0.75)';
      ctx.fillRect(bx + b.w * 0.55, by + b.h * 0.22, 22, 12);
      // Windows around the walls.
      ctx.fillStyle = b.lit ? PALETTE.windowLit : PALETTE.windowDark;
      const cols = Math.max(2, Math.floor(b.w / 34));
      const rows = Math.max(2, Math.floor(b.h / 34));
      for (let i = 0; i < cols; i += 1) {
        ctx.fillRect(bx + 12 + (i * (b.w - 24)) / cols, by + 2, 10, 4);
        ctx.fillRect(bx + 12 + (i * (b.w - 24)) / cols, by + b.h - 6, 10, 4);
      }
      for (let i = 0; i < rows; i += 1) {
        ctx.fillRect(bx + 2, by + 12 + (i * (b.h - 24)) / rows, 4, 10);
        ctx.fillRect(bx + b.w - 6, by + 12 + (i * (b.h - 24)) / rows, 4, 10);
      }
      void lift;
    }
    if (block.label) {
      ctx.fillStyle = 'rgba(20, 18, 24, 0.8)';
      ctx.font = `bold 15px ${FONT}`;
      ctx.textAlign = 'center';
      const label = block.label;
      const tw = ctx.measureText(label).width;
      ctx.fillRect(x + r.w / 2 - tw / 2 - 8, y + 8, tw + 16, 24);
      ctx.fillStyle = '#f5f1e6';
      ctx.fillText(label, x + r.w / 2, y + 25);
      ctx.textAlign = 'left';
    }
  }

  function drawProps(world, cam, time) {
    for (const t of world.city.trees) {
      const x = t.x - cam.x;
      const y = t.y - cam.y;
      if (x < -40 || y < -40 || x > viewW + 40 || y > viewH + 40) continue;
      ctx.fillStyle = PALETTE.shadow;
      ctx.beginPath();
      ctx.ellipse(x + 5, y + 6, t.r, t.r * 0.7, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = t.shade ? PALETTE.treeDark : PALETTE.tree;
      ctx.beginPath();
      ctx.arc(x, y, t.r, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,0.15)';
      ctx.beginPath();
      ctx.arc(x - t.r * 0.3, y - t.r * 0.3, t.r * 0.45, 0, Math.PI * 2);
      ctx.fill();
    }
    for (const c of world.city.crates) {
      const x = c.x - cam.x;
      const y = c.y - cam.y;
      if (x + c.w < 0 || y + c.h < 0 || x > viewW || y > viewH) continue;
      ctx.fillStyle = PALETTE.shadow;
      ctx.fillRect(x + 3, y + 4, c.w, c.h);
      ctx.fillStyle = c.hue;
      ctx.fillRect(x, y, c.w, c.h);
      ctx.strokeStyle = 'rgba(0,0,0,0.3)';
      ctx.strokeRect(x, y, c.w, c.h);
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x + c.w, y + c.h);
      ctx.stroke();
    }
    for (const lamp of world.city.lamps) {
      const x = lamp.x - cam.x;
      const y = lamp.y - cam.y;
      if (x < -10 || y < -10 || x > viewW + 10 || y > viewH + 10) continue;
      ctx.fillStyle = '#2b2b30';
      ctx.fillRect(x - 2, y - 2, 4, 4);
      ctx.fillStyle = '#ffe9a8';
      ctx.beginPath();
      ctx.arc(x, y, 3, 0, Math.PI * 2);
      ctx.fill();
    }
    void time;
  }

  function drawMarker(world, cam, time) {
    const marker = missionMarker(world);
    if (!marker) return;
    const x = marker.x - cam.x;
    const y = marker.y - cam.y;
    const bob = Math.sin(time * 3) * 5;
    // A beacon column and a bouncing arrow over the objective.
    const grad = ctx.createLinearGradient(x, y - 130, x, y);
    grad.addColorStop(0, 'rgba(255, 209, 102, 0)');
    grad.addColorStop(1, 'rgba(255, 209, 102, 0.35)');
    ctx.fillStyle = grad;
    ctx.fillRect(x - 14, y - 130, 28, 130);
    ctx.fillStyle = PALETTE.marker;
    ctx.beginPath();
    ctx.ellipse(x, y, 26, 11, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = 'rgba(20, 18, 24, 0.85)';
    ctx.beginPath();
    ctx.moveTo(x, y - 44 + bob);
    ctx.lineTo(x - 12, y - 62 + bob);
    ctx.lineTo(x + 12, y - 62 + bob);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = PALETTE.marker;
    ctx.beginPath();
    ctx.moveTo(x, y - 46 + bob);
    ctx.lineTo(x - 9, y - 60 + bob);
    ctx.lineTo(x + 9, y - 60 + bob);
    ctx.closePath();
    ctx.fill();
  }

  // Off-screen objective: an arrow pinned to the screen edge, pointing the
  // way, with the distance. Nothing to show while the objective is in view.
  function drawEdgeArrow(world, cam) {
    const marker = missionMarker(world);
    if (!marker) return;
    const x = marker.x - cam.x;
    const y = marker.y - cam.y;
    const margin = 46;
    if (x > margin && x < viewW - margin && y > margin && y < viewH - margin) return;
    const cx = viewW / 2;
    const cy = viewH / 2;
    const angle = Math.atan2(y - cy, x - cx);
    const dx = Math.cos(angle);
    const dy = Math.sin(angle);
    const tx = dx !== 0 ? (dx > 0 ? (viewW - margin - cx) / dx : (margin - cx) / dx) : Infinity;
    const ty = dy !== 0 ? (dy > 0 ? (viewH - margin - cy) / dy : (margin - cy) / dy) : Infinity;
    const t = Math.min(tx, ty);
    const ex = cx + dx * t;
    const ey = cy + dy * t;
    ctx.save();
    ctx.translate(ex, ey);
    ctx.rotate(angle);
    ctx.fillStyle = PALETTE.marker;
    ctx.beginPath();
    ctx.moveTo(16, 0);
    ctx.lineTo(-8, -11);
    ctx.lineTo(-8, 11);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
    const dist = Math.hypot(marker.x - world.player.x, marker.y - world.player.y);
    ctx.fillStyle = '#f5f1e6';
    ctx.font = `bold 12px ${FONT}`;
    ctx.textAlign = 'center';
    ctx.fillText(`${Math.round(dist / 10)}m`, ex, ey + 26);
    ctx.textAlign = 'left';
  }

  // Mara by her garage: a standing figure with a name tag, so "talk to Mara" has a face.
  function drawMara(mara, time) {
    drawPedestrian(
      ctx,
      { x: mara.x, y: mara.y, angle: Math.PI / 2, speed: 0, state: 'idle', shirt: '#7be8f5', skin: '#e0ac69', thug: false, walkPhase: time },
      time,
    );
    ctx.fillStyle = 'rgba(20, 18, 24, 0.8)';
    ctx.font = `bold 12px ${FONT}`;
    ctx.textAlign = 'center';
    const label = 'MARA';
    const tw = ctx.measureText(label).width;
    ctx.fillRect(mara.x - tw / 2 - 6, mara.y - 34, tw + 12, 18);
    ctx.fillStyle = '#7be8f5';
    ctx.fillText(label, mara.x, mara.y - 21);
    ctx.textAlign = 'left';
  }

  function drawEffects(world, cam) {
    for (const p of world.particles) {
      const alpha = Math.max(0, p.life / p.maxLife);
      ctx.fillStyle = p.color.replace('A', String(alpha * p.alpha));
      ctx.beginPath();
      ctx.arc(p.x - cam.x, p.y - cam.y, p.size * (0.5 + alpha * 0.5), 0, Math.PI * 2);
      ctx.fill();
    }
    // Skid marks fade slowly.
    for (const s of world.skids) {
      ctx.strokeStyle = `rgba(20, 20, 24, ${0.35 * (s.life / s.maxLife)})`;
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.moveTo(s.x1 - cam.x, s.y1 - cam.y);
      ctx.lineTo(s.x2 - cam.x, s.y2 - cam.y);
      ctx.stroke();
    }
  }

  function drawWorld(world, cam, time) {
    drawGround(cam);
    for (const block of world.city.blocks) drawBlock(block, cam);
    drawProps(world, cam, time);
    drawMarker(world, cam, time);
    drawEdgeArrow(world, cam);
    // Entities sorted by y so nearer things overlap farther ones. Kind and
    // reference, not per-frame closures, keep the sort allocation-light.
    const drawables = [];
    for (const car of world.cars) drawables.push({ y: car.y, kind: 0, ref: car });
    for (const ped of world.peds) drawables.push({ y: ped.y, kind: 1, ref: ped });
    drawables.push({ y: world.player.y, kind: 2, ref: world.player });
    if (world.mara) drawables.push({ y: world.mara.y, kind: 3, ref: world.mara });
    drawables.sort((a, b) => a.y - b.y);
    ctx.save();
    ctx.translate(-cam.x, -cam.y);
    drawPickups(ctx, world, time);
    for (const d of drawables) {
      if (d.kind === 0) drawCar(ctx, d.ref, time);
      else if (d.kind === 1) drawPedestrian(ctx, d.ref, time);
      else if (d.kind === 2) drawPlayer(ctx, d.ref, time);
      else drawMara(d.ref, time);
    }
    ctx.restore();
    drawEffects(world, cam);
    // Warm sunlight and a soft vignette.
    const sun = ctx.createLinearGradient(0, 0, viewW, viewH);
    sun.addColorStop(0, 'rgba(255, 224, 160, 0.10)');
    sun.addColorStop(1, 'rgba(255, 180, 120, 0.05)');
    ctx.fillStyle = sun;
    ctx.fillRect(0, 0, viewW, viewH);
    const vig = ctx.createRadialGradient(viewW / 2, viewH / 2, Math.min(viewW, viewH) * 0.45, viewW / 2, viewH / 2, Math.max(viewW, viewH) * 0.75);
    vig.addColorStop(0, 'rgba(0,0,0,0)');
    vig.addColorStop(1, 'rgba(20, 10, 0, 0.22)');
    ctx.fillStyle = vig;
    ctx.fillRect(0, 0, viewW, viewH);
  }

  function drawTitle(world, time, hasSave, mouse) {
    // The city drifts behind the title: a slow pan over downtown.
    const cam = {
      x: 1536 - viewW / 2 + Math.sin(time * 0.05) * 320,
      y: 1536 - viewH / 2 + Math.cos(time * 0.04) * 220,
    };
    drawWorld(world, cam, time);
    ctx.fillStyle = 'rgba(12, 10, 18, 0.55)';
    ctx.fillRect(0, 0, viewW, viewH);
    ctx.textAlign = 'center';
    ctx.fillStyle = '#ffd166';
    ctx.font = `bold 74px ${FONT}`;
    ctx.shadowColor = 'rgba(255, 120, 200, 0.8)';
    ctx.shadowBlur = 28;
    ctx.fillText('NEON HARBOR', viewW / 2, viewH / 2 - 96);
    ctx.shadowBlur = 0;
    ctx.fillStyle = '#7be8f5';
    ctx.font = `bold 20px ${FONT}`;
    ctx.fillText('AN ORIGINAL OPEN-WORLD CRIME STORY', viewW / 2, viewH / 2 - 62);
    ctx.fillStyle = PALETTE.text;
    ctx.font = `16px ${FONT}`;
    ctx.fillText('New in town. Broke. Good behind a wheel. Mara has work for you.', viewW / 2, viewH / 2 - 28);
    // Menu buttons.
    const bw = 280;
    const bx = viewW / 2 - bw / 2;
    const items = hasSave ? ['CONTINUE', 'NEW GAME'] : ['NEW GAME'];
    items.forEach((label, i) => {
      const by = viewH / 2 + 8 + i * 54;
      const hover = mouse && mouse.x >= bx && mouse.x <= bx + bw && mouse.y >= by && mouse.y <= by + 42;
      ctx.fillStyle = i === 0 ? (hover ? '#ffd166' : 'rgba(255, 209, 102, 0.92)') : hover ? 'rgba(60, 54, 72, 0.92)' : 'rgba(20, 18, 24, 0.8)';
      ctx.strokeStyle = hover ? PALETTE.gold : PALETTE.panelEdge;
      ctx.lineWidth = hover ? 2 : 1;
      ctx.beginPath();
      ctx.roundRect(bx, by, bw, 42, 8);
      ctx.fill();
      ctx.stroke();
      ctx.lineWidth = 1;
      ctx.fillStyle = i === 0 ? '#20180a' : PALETTE.text;
      ctx.font = `bold 17px ${FONT}`;
      ctx.fillText(label, viewW / 2, by + 27);
    });
    ctx.fillStyle = PALETTE.muted;
    ctx.font = `13px ${FONT}`;
    ctx.fillText('WASD / arrows — walk & drive      E — enter / steal car      Space / click — punch      Shift — sprint', viewW / 2, viewH / 2 + 132);
    ctx.fillText('Tab — missions      P — pause      M — mute      Enter — start', viewW / 2, viewH / 2 + 154);
    ctx.fillText('An original game: its city, people, cars and story are invented here. Nothing from any other game.', viewW / 2, viewH - 22);
    ctx.textAlign = 'left';
    // Return the button rects for click handling.
    return items.map((label, i) => ({ label, x: bx, y: viewH / 2 + 8 + i * 54, w: bw, h: 42 }));
  }

  function drawPause(world) {
    ctx.fillStyle = 'rgba(10, 8, 14, 0.62)';
    ctx.fillRect(0, 0, viewW, viewH);
    ctx.textAlign = 'center';
    ctx.fillStyle = PALETTE.text;
    ctx.font = `bold 44px ${FONT}`;
    ctx.fillText('PAUSED', viewW / 2, viewH / 2 - 60);
    ctx.font = `16px ${FONT}`;
    ctx.fillStyle = PALETTE.muted;
    ctx.fillText(`${RANKS[Math.min(RANKS.length - 1, world.missions.done.length)]}  ·  $${world.player.money}  ·  ${world.missions.done.length} of 4 missions done`, viewW / 2, viewH / 2 - 26);
    ctx.fillStyle = PALETTE.text;
    ctx.fillText('P / Esc — resume      Click — resume', viewW / 2, viewH / 2 + 8);
    ctx.fillText('WASD / arrows — walk & drive      E — enter car      Space — punch      Shift — sprint', viewW / 2, viewH / 2 + 34);
    ctx.fillText('Tab — missions      M — mute', viewW / 2, viewH / 2 + 58);
    ctx.fillText('Progress saves automatically.', viewW / 2, viewH / 2 + 84);
    ctx.textAlign = 'left';
  }

  function drawEndScreen(kind, world) {
    ctx.fillStyle = kind === SCREEN_BUSTED ? 'rgba(20, 40, 90, 0.6)' : 'rgba(90, 20, 20, 0.6)';
    ctx.fillRect(0, 0, viewW, viewH);
    ctx.textAlign = 'center';
    ctx.fillStyle = '#f5f1e6';
    ctx.font = `bold 56px ${FONT}`;
    ctx.fillText(kind === SCREEN_BUSTED ? 'BUSTED' : 'WASTED', viewW / 2, viewH / 2 - 30);
    ctx.font = `17px ${FONT}`;
    ctx.fillText(
      kind === SCREEN_BUSTED
        ? `The cops took $${world.lastFine} and your record is clean. Mara is not impressed.`
        : `You wake up at the hospital, $${world.lastFine} lighter. The city waits.`,
      viewW / 2,
      viewH / 2 + 6,
    );
    ctx.fillStyle = PALETTE.gold;
    ctx.font = `bold 16px ${FONT}`;
    ctx.fillText('Press Enter or click to get back out there', viewW / 2, viewH / 2 + 44);
    ctx.textAlign = 'left';
  }

  /** Paint one frame: the world, the HUD, the minimap and the screen overlay. */
  function draw(world, screen, ui) {
    const time = world.time;
    if (screen === SCREEN_TITLE) {
      return drawTitle(world, time, ui.hasSave, ui.mouse);
    }
    // The camera is a centre point; the view is the window around it, clamped
    // to the world, with the screen shake folded in.
    const shakeX = (Math.random() - 0.5) * world.shake * 12;
    const shakeY = (Math.random() - 0.5) * world.shake * 12;
    const cam = {
      x: Math.max(0, Math.min(WORLD.size - viewW, world.camera.x - viewW / 2)) + shakeX,
      y: Math.max(0, Math.min(WORLD.size - viewH, world.camera.y - viewH / 2)) + shakeY,
    };
    drawWorld(world, cam, time);
    drawMinimap(ctx, world, 104, viewH - 104, 88, time);
    drawHUD(ctx, world, { width: viewW, height: viewH }, ui.prompt, ui.messages, ui.showMissions, ui.briefing);
    if (screen === SCREEN_PAUSED) drawPause(world);
    if (screen === SCREEN_BUSTED || screen === SCREEN_WASTED) drawEndScreen(screen, world);
    return null;
  }

  return { resize, draw, view: () => ({ width: viewW, height: viewH }) };
}
