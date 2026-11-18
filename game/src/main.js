// Boot and the one loop: input is read every frame, the world advances in fixed
// 1/60 s steps, and the renderer paints what is there. The game moves between
// five screens: title, play, paused, busted and wasted. Progress saves itself.
//
// ?seed=N fixes the city. ?shot=start|drive|chase|mission (with &seed=N) stages
// that scene instead of running the loop, paints it twice and sets
// window.__shotReady for a screenshot.

import { STEP } from './config.js';
import { createWorld, currentPrompt, resetWorld, applySave, stepWorld } from './world.js';
import { createInput, ACTION_CONFIRM, ACTION_MISSIONS, ACTION_MUTE, ACTION_PAUSE } from './input.js';
import { createAudio } from './audio.js';
import { hasSave, loadSave, saveGame } from './save.js';
import { createRenderer, SCREEN_BUSTED, SCREEN_PAUSED, SCREEN_PLAY, SCREEN_TITLE, SCREEN_WASTED } from './render.js';
import { stageShot } from './shots.js';
import { activeMission } from './missions.js';

/** The longest frame the loop catches up on; a longer stall (a hidden tab) is dropped, not replayed. */
const MAX_FRAME = 0.25;
const AUTOSAVE_EVERY = 30;

const params = new URLSearchParams(window.location.search);
const shot = params.get('shot');
const seedParam = Number.parseInt(params.get('seed') ?? '', 10);
const seed = Number.isInteger(seedParam) ? seedParam : Math.floor(Math.random() * 4294967296);

const canvas = document.getElementById('game');
const status = document.getElementById('status');
const world = createWorld(seed);
const renderer = createRenderer(canvas);
const audio = createAudio();

function resize() {
  renderer.resize(window.innerWidth, window.innerHeight);
}
window.addEventListener('resize', resize);
resize();

function runShot(name) {
  const scene = stageShot(name, world);
  const ui = { hasSave: false, prompt: null, messages: [], showMissions: false, briefing: null };
  let painted = 0;
  function paint() {
    renderer.draw(world, scene.screen, ui);
    painted += 1;
    if (painted < 2) requestAnimationFrame(paint);
    else window.__shotReady = true;
  }
  requestAnimationFrame(paint);
}

function runGame() {
  const input = createInput(canvas);
  let screen = SCREEN_TITLE;
  let showMissions = false;
  let briefing = null;
  let briefingQueue = [];
  let titleButtons = [];
  let accumulator = 0;
  let last = performance.now();
  let messages = [];
  let saveNotice = 0;
  let frameCount = 0;
  // Debug handle for play-testing: the screen, the briefing card and the held keys.
  window.__neon.debug = {
    screen: () => screen,
    briefing: () => briefing,
    held: () => [...input.held()],
    frames: () => frameCount,
    hidden: () => document.hidden,
  };

  function announce(message) {
    status.textContent = message;
  }

  function pushMessage(text) {
    messages.push({ text, time: 6 });
    if (messages.length > 5) messages.shift();
  }

  function doSave(quiet) {
    if (saveGame(world)) {
      saveNotice = quiet ? 0 : 2.5;
    }
  }

  function queueBriefing(def) {
    briefingQueue.push({ title: def.title, brief: def.brief });
  }

  function startGame(fromSave) {
    resetWorld(world);
    if (fromSave) {
      const data = loadSave();
      if (data) {
        world.seed = data.seed;
        resetWorld(world);
        applySave(world, data);
        pushMessage('Save loaded. Welcome back to Neon Harbor.');
      }
    } else {
      const def = activeMission(world.missions);
      if (def) queueBriefing(def);
    }
    accumulator = 0;
    screen = SCREEN_PLAY;
    announce('Playing. Follow the gold marker.');
  }

  /** Turn the world's events into sounds, messages and screen changes. */
  function handleEvents(events) {
    for (const e of events) {
      if (e.type === 'crash') audio.crash();
      else if (e.type === 'punch') audio.punch();
      else if (e.type === 'hit') audio.hit();
      else if (e.type === 'hurt') audio.hit();
      else if (e.type === 'cash') {
        audio.cash();
        pushMessage(`+$${e.amount}`);
      } else if (e.type === 'door') audio.door();
      else if (e.type === 'heal') audio.heal();
      else if (e.type === 'crime' && e.kind === 'steal') pushMessage('You stole a car — the cops noticed!');
      else if (e.type === 'crime') pushMessage('That was a crime. The heat is on.');
      else if (e.type === 'wanted' && e.stars > 0) pushMessage(`Wanted level: ${'★'.repeat(e.stars)}`);
      else if (e.type === 'wanted') pushMessage('You lost the cops. Clean — for now.');
      else if (e.type === 'missionDone') {
        audio.missionDone();
        doSave(true);
      } else if (e.type === 'briefing') {
        queueBriefing({ title: e.title, brief: e.brief });
      } else if (e.type === 'objective') {
        audio.click();
      }
    }
    if (world.pendingEnd === 'busted') {
      world.pendingEnd = null;
      audio.busted();
      screen = SCREEN_BUSTED;
      doSave(true);
      announce('Busted. The police took their fine.');
    } else if (world.pendingEnd === 'wasted') {
      world.pendingEnd = null;
      audio.wasted();
      screen = SCREEN_WASTED;
      doSave(true);
      announce('Wasted. You wake up at the hospital.');
    }
  }

  function handleTitleClick(click) {
    if (!click) return false;
    for (const b of titleButtons) {
      if (click.x >= b.x && click.x <= b.x + b.w && click.y >= b.y && click.y <= b.y + b.h) {
        audio.unlock();
        audio.click();
        startGame(b.label === 'CONTINUE');
        return true;
      }
    }
    return false;
  }

  function frame(now) {
    requestAnimationFrame(frame);
    frameCount += 1;
    const frameDt = Math.min((now - last) / 1000, MAX_FRAME);
    last = now;
    const actions = input.takeActions();
    const click = input.takeClick();
    if (actions || click) audio.unlock();

    // Message feed ages in real time.
    for (let i = messages.length - 1; i >= 0; i -= 1) {
      messages[i].time -= frameDt;
      if (messages[i].time <= 0) messages.splice(i, 1);
    }
    if (saveNotice > 0) saveNotice -= frameDt;

    if (screen === SCREEN_TITLE) {
      if (actions & ACTION_CONFIRM) {
        audio.click();
        startGame(hasSave());
      } else {
        handleTitleClick(click);
      }
      // The city idles behind the title.
      accumulator += frameDt;
      while (accumulator >= STEP) {
        stepWorld(world, STEP, { moveVector: () => ({ x: 0, y: 0 }), driveVector: () => ({ throttle: 0, steer: 0, handbrake: false }), sprinting: () => false }, 0, null);
        accumulator -= STEP;
      }
      titleButtons = renderer.draw(world, screen, { hasSave: hasSave(), prompt: null, messages: [], showMissions: false, briefing: null }) || [];
      return;
    }

    if (screen === SCREEN_BUSTED || screen === SCREEN_WASTED) {
      if ((actions & ACTION_CONFIRM) || click) {
        audio.click();
        screen = SCREEN_PLAY;
        announce('Playing.');
      }
      renderer.draw(world, screen, { hasSave: false, prompt: null, messages, showMissions: false, briefing: null });
      return;
    }

    if (briefing) {
      if ((actions & ACTION_CONFIRM) || click) {
        audio.click();
        briefing = null;
      }
      renderer.draw(world, SCREEN_PLAY, { hasSave: false, prompt: null, messages, showMissions: false, briefing });
      return;
    }

    if (actions & ACTION_MUTE) {
      const muted = audio.toggleMute();
      pushMessage(muted ? 'Sound off' : 'Sound on');
    }
    if (actions & ACTION_MISSIONS && screen === SCREEN_PLAY) {
      showMissions = !showMissions;
      audio.click();
    }
    if (actions & ACTION_PAUSE) {
      if (screen === SCREEN_PLAY) {
        screen = SCREEN_PAUSED;
        showMissions = false;
        doSave(true);
        announce('Paused. Progress saved.');
      } else if (screen === SCREEN_PAUSED) {
        screen = SCREEN_PLAY;
        announce('Playing.');
      }
    }

    if (screen === SCREEN_PAUSED) {
      if (actions & ACTION_CONFIRM) {
        screen = SCREEN_PLAY;
        announce('Playing.');
      }
      renderer.draw(world, screen, { hasSave: false, prompt: null, messages, showMissions: false, briefing: null });
      return;
    }

    // Playing (or reading the mission list, which pauses the world).
    if (!showMissions) {
      accumulator += frameDt;
      // One-shot actions (E, Space) belong to the first step only: a slow
      // frame that runs two steps must not enter and immediately exit a car.
      let stepActions = actions;
      while (accumulator >= STEP) {
        const events = stepWorld(world, STEP, input, stepActions, audio);
        stepActions = 0;
        handleEvents(events);
        accumulator -= STEP;
        if (screen !== SCREEN_PLAY) break;
        if (briefingQueue.length > 0 && !briefing) {
          briefing = briefingQueue.shift();
          break;
        }
      }
      if (briefingQueue.length > 0 && !briefing) briefing = briefingQueue.shift();
      if (world.saveTimer >= AUTOSAVE_EVERY) {
        world.saveTimer = 0;
        doSave(true);
      }
    } else {
      accumulator = 0;
    }

    const ui = {
      hasSave: false,
      prompt: showMissions ? null : currentPrompt(world),
      messages,
      showMissions,
      briefing: null,
    };
    renderer.draw(world, SCREEN_PLAY, ui);
    if (saveNotice > 0) {
      const view = renderer.view();
      const ctx = canvas.getContext('2d');
      ctx.fillStyle = 'rgba(245, 241, 230, 0.8)';
      ctx.font = '12px system-ui, sans-serif';
      ctx.textAlign = 'right';
      ctx.fillText('Game saved', view.width - 20, view.height - 20);
      ctx.textAlign = 'left';
    }
  }

  document.addEventListener('visibilitychange', () => {
    if (document.hidden && screen === SCREEN_PLAY) {
      screen = SCREEN_PAUSED;
      doSave(true);
      announce('Paused.');
    }
  });

  announce('Neon Harbor. Press Enter or click to start.');
  requestAnimationFrame(frame);
}

// A handle for play-testing: the world and its screens, read-only by convention.
window.__neon = { world, get seed() { return seed; } };

if (shot) runShot(shot);
else runGame();
