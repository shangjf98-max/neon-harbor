// The HUD: health, money, wanted stars, speed, the current objective, prompts,
// the message feed, the mission list panel and the briefing card. Everything is
// drawn on the canvas in screen space, after the world.

import { FONT, PALETTE, PLAYER, RANKS } from './config.js';
import { activeMission, activeStep, missionList } from './missions.js';

function panel(ctx, x, y, w, h) {
  ctx.fillStyle = PALETTE.panel;
  ctx.strokeStyle = PALETTE.panelEdge;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, 8);
  ctx.fill();
  ctx.stroke();
}

function drawStars(ctx, x, y, wanted) {
  ctx.font = '22px system-ui, sans-serif';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  for (let i = 0; i < 5; i += 1) {
    ctx.fillStyle = i < wanted ? PALETTE.star : 'rgba(245, 241, 230, 0.25)';
    ctx.fillText('★', x + i * 26, y);
  }
}

export function drawHUD(ctx, world, view, prompt, messages, showMissions, briefing) {
  const { width, height } = view;
  const player = world.player;
  ctx.textBaseline = 'alphabetic';

  // Top left: health bar, money, rank.
  panel(ctx, 14, 14, 218, 74);
  ctx.fillStyle = PALETTE.text;
  ctx.font = `bold 13px ${FONT}`;
  ctx.textAlign = 'left';
  ctx.fillText(RANKS[Math.min(RANKS.length - 1, world.missions.done.length)].toUpperCase(), 26, 34);
  ctx.fillStyle = '#3a3a42';
  ctx.beginPath();
  ctx.roundRect(26, 42, 150, 12, 6);
  ctx.fill();
  const hpFrac = Math.max(0, player.hp / PLAYER.hp);
  ctx.fillStyle = hpFrac > 0.5 ? PALETTE.health : hpFrac > 0.25 ? PALETTE.gold : PALETTE.danger;
  if (hpFrac > 0) {
    ctx.beginPath();
    ctx.roundRect(26, 42, 150 * hpFrac, 12, 6);
    ctx.fill();
  }
  ctx.fillStyle = PALETTE.money;
  ctx.font = `bold 17px ${FONT}`;
  ctx.fillText(`$${player.money}`, 184, 54);
  ctx.fillStyle = PALETTE.muted;
  ctx.font = `11px ${FONT}`;
  ctx.fillText(`HP ${Math.ceil(player.hp)}`, 26, 80);

  // Top right: wanted stars.
  panel(ctx, width - 176, 14, 162, 44);
  drawStars(ctx, width - 162, 37, world.wanted);
  if (world.wanted > 0) {
    ctx.fillStyle = PALETTE.danger;
    ctx.font = `bold 11px ${FONT}`;
    ctx.textAlign = 'right';
    ctx.fillText('WANTED', width - 26, 54);
    ctx.textAlign = 'left';
  }

  // Objective, under the top bar: mission title, current step, and the clock.
  const def = activeMission(world.missions);
  const step = activeStep(world.missions);
  if (def && step) {
    const text = step.text;
    ctx.font = `bold 15px ${FONT}`;
    const tw = ctx.measureText(text).width;
    const bw = Math.min(width - 40, tw + 120);
    const bx = (width - bw) / 2;
    panel(ctx, bx, 14, bw, 46);
    ctx.fillStyle = PALETTE.gold;
    ctx.font = `bold 12px ${FONT}`;
    ctx.textAlign = 'left';
    ctx.fillText(def.title.toUpperCase(), bx + 14, 32);
    ctx.fillStyle = PALETTE.text;
    ctx.font = `14px ${FONT}`;
    ctx.fillText(text, bx + 14, 50);
    if (world.missions.timer > 0) {
      ctx.fillStyle = world.missions.timer < 20 ? PALETTE.danger : PALETTE.text;
      ctx.font = `bold 16px ${FONT}`;
      ctx.textAlign = 'right';
      ctx.fillText(`${Math.ceil(world.missions.timer)}s`, bx + bw - 14, 33);
      ctx.textAlign = 'left';
    }
  }

  // Speed, bottom right, while driving.
  const car = world.cars.find((c) => c.id === player.carId);
  if (car) {
    const kmh = Math.round(Math.abs(car.speed) * 0.22);
    panel(ctx, width - 128, height - 64, 114, 50);
    ctx.fillStyle = PALETTE.text;
    ctx.font = `bold 24px ${FONT}`;
    ctx.textAlign = 'right';
    ctx.fillText(`${kmh}`, width - 56, height - 30);
    ctx.font = `11px ${FONT}`;
    ctx.fillStyle = PALETTE.muted;
    ctx.textAlign = 'left';
    ctx.fillText('km/h', width - 50, height - 30);
    ctx.textAlign = 'left';
    // Damage bar under the speed.
    ctx.fillStyle = '#3a3a42';
    ctx.fillRect(width - 114, height - 26, 86, 5);
    ctx.fillStyle = car.hp > 50 ? PALETTE.health : car.hp > 25 ? PALETTE.gold : PALETTE.danger;
    ctx.fillRect(width - 114, height - 26, 86 * (car.hp / 100), 5);
  }

  // Interaction prompt, bottom centre.
  if (prompt) {
    ctx.font = `bold 15px ${FONT}`;
    const tw = ctx.measureText(prompt).width;
    panel(ctx, (width - tw) / 2 - 16, height - 118, tw + 32, 34);
    ctx.fillStyle = PALETTE.text;
    ctx.textAlign = 'center';
    ctx.fillText(prompt, width / 2, height - 95);
    ctx.textAlign = 'left';
  }

  // Message feed, above the minimap.
  ctx.font = `13px ${FONT}`;
  let my = height - 216;
  for (let i = messages.length - 1; i >= 0; i -= 1) {
    const m = messages[i];
    const alpha = Math.min(1, m.time / 1.5);
    ctx.fillStyle = `rgba(245, 241, 230, ${alpha})`;
    ctx.fillText(m.text, 22, my);
    my -= 20;
  }

  // Mission banner, centre screen.
  if (world.missions.banner && world.missions.bannerTime > 0) {
    const alpha = Math.min(1, world.missions.bannerTime / 0.8);
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.textAlign = 'center';
    ctx.fillStyle = PALETTE.gold;
    ctx.font = `bold 34px ${FONT}`;
    ctx.shadowColor = 'rgba(0,0,0,0.6)';
    ctx.shadowBlur = 12;
    ctx.fillText(world.missions.banner.title, width / 2, 120);
    ctx.shadowBlur = 0;
    ctx.fillStyle = PALETTE.text;
    ctx.font = `16px ${FONT}`;
    ctx.fillText(world.missions.banner.sub, width / 2, 148);
    ctx.restore();
    ctx.textAlign = 'left';
  }

  // Bust progress: the ring closing in while the police corner the player.
  if (world.bustTimer > 0) {
    ctx.fillStyle = PALETTE.danger;
    ctx.font = `bold 18px ${FONT}`;
    ctx.textAlign = 'center';
    ctx.fillText('BUSTED?', width / 2, height - 160);
    ctx.fillStyle = '#3a3a42';
    ctx.fillRect(width / 2 - 90, height - 150, 180, 8);
    ctx.fillStyle = PALETTE.danger;
    ctx.fillRect(width / 2 - 90, height - 150, 180 * Math.min(1, world.bustTimer / 2.2), 8);
    ctx.textAlign = 'left';
  }

  // Briefing card: Mara's words when a mission starts.
  if (briefing) {
    const bw = Math.min(560, width - 60);
    const bx = (width - bw) / 2;
    const by = height - 250;
    panel(ctx, bx, by, bw, 108);
    ctx.fillStyle = PALETTE.gold;
    ctx.font = `bold 14px ${FONT}`;
    ctx.fillText(`NEW MISSION — ${briefing.title.toUpperCase()}`, bx + 18, by + 26);
    ctx.fillStyle = PALETTE.text;
    ctx.font = `14px ${FONT}`;
    wrapText(ctx, briefing.brief, bx + 18, by + 50, bw - 36, 20);
    ctx.fillStyle = PALETTE.muted;
    ctx.font = `12px ${FONT}`;
    ctx.fillText('Enter or click to continue', bx + 18, by + 92);
  }

  // Mission list panel (Tab).
  if (showMissions) {
    const bw = Math.min(600, width - 60);
    const bh = 300;
    const bx = (width - bw) / 2;
    const by = (height - bh) / 2;
    ctx.fillStyle = 'rgba(10, 8, 14, 0.6)';
    ctx.fillRect(0, 0, width, height);
    panel(ctx, bx, by, bw, bh);
    ctx.fillStyle = PALETTE.gold;
    ctx.font = `bold 20px ${FONT}`;
    ctx.fillText('MISSIONS', bx + 22, by + 36);
    ctx.fillStyle = PALETTE.muted;
    ctx.font = `12px ${FONT}`;
    ctx.fillText('Tab to close', bx + bw - 90, by + 34);
    let y = by + 66;
    for (const m of missionList(world.missions)) {
      const mark = m.status === 'done' ? '✓' : m.status === 'active' ? '►' : '·';
      ctx.fillStyle = m.status === 'active' ? PALETTE.gold : m.status === 'done' ? PALETTE.money : PALETTE.muted;
      ctx.font = `bold 15px ${FONT}`;
      ctx.fillText(`${mark} ${m.title}`, bx + 22, y);
      ctx.fillStyle = PALETTE.muted;
      ctx.font = `12px ${FONT}`;
      ctx.fillText(m.status === 'done' ? 'Complete' : m.status === 'active' ? 'In progress' : 'Locked', bx + bw - 110, y);
      ctx.fillStyle = PALETTE.text;
      ctx.font = `13px ${FONT}`;
      ctx.fillText(`${m.giver} · Reward $${m.reward}`, bx + 42, y + 20);
      y += 46;
    }
    ctx.fillStyle = PALETTE.muted;
    ctx.font = `13px ${FONT}`;
    ctx.fillText(`Total earned: $${world.missions.earned}   ·   Cars stolen: ${world.stats.stolen}   ·   Time: ${Math.floor(world.playTime / 60)}m`, bx + 22, by + bh - 18);
  }
}

/** Word-wrap a paragraph into a column of text. */
function wrapText(ctx, text, x, y, maxWidth, lineHeight) {
  const words = text.split(' ');
  let line = '';
  let yy = y;
  for (const word of words) {
    const test = line ? `${line} ${word}` : word;
    if (ctx.measureText(test).width > maxWidth && line) {
      ctx.fillText(line, x, yy);
      line = word;
      yy += lineHeight;
    } else {
      line = test;
    }
  }
  if (line) ctx.fillText(line, x, yy);
}
