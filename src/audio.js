// Every sound is synthesised with WebAudio: no audio files, no network. The
// engine hum and the police siren are loops whose pitch follows the game; the
// rest are short one-shots. Audio starts on the first user gesture, as browsers
// require, and M toggles mute.

export function createAudio() {
  let ctx = null;
  let master = null;
  let engineOsc = null;
  let engineGain = null;
  let sirenOsc = null;
  let sirenGain = null;
  let sirenLfo = null;
  let muted = false;
  let started = false;

  function ensure() {
    if (started) return true;
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return false;
      ctx = new AC();
      master = ctx.createGain();
      master.gain.value = muted ? 0 : 0.5;
      master.connect(ctx.destination);
      started = true;
      return true;
    } catch {
      return false;
    }
  }

  /** Call from a user gesture (key, click) so the browser allows sound. */
  function unlock() {
    if (ensure() && ctx.state === 'suspended') ctx.resume().catch(() => {});
  }

  function tone(freq, dur, type, volume, slideTo) {
    if (!ensure() || muted) return;
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, now);
    if (slideTo !== undefined) osc.frequency.exponentialRampToValueAtTime(Math.max(20, slideTo), now + dur);
    gain.gain.setValueAtTime(volume, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + dur);
    osc.connect(gain).connect(master);
    osc.start(now);
    osc.stop(now + dur + 0.02);
  }

  function noise(dur, volume, filterFreq) {
    if (!ensure() || muted) return;
    const now = ctx.currentTime;
    const len = Math.floor(ctx.sampleRate * dur);
    const buffer = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < len; i += 1) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const src = ctx.createBufferSource();
    src.buffer = buffer;
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = filterFreq;
    const gain = ctx.createGain();
    gain.gain.value = volume;
    src.connect(filter).connect(gain).connect(master);
    src.start(now);
  }

  /** The engine loop: call every frame with 0..1 speed; 0 with driving=false silences it. */
  function engine(speed01, driving) {
    if (!ensure()) return;
    if (!engineOsc) {
      engineOsc = ctx.createOscillator();
      engineOsc.type = 'sawtooth';
      engineGain = ctx.createGain();
      engineGain.gain.value = 0;
      const filter = ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.value = 420;
      engineOsc.connect(filter).connect(engineGain).connect(master);
      engineOsc.start();
    }
    const target = driving && !muted ? 0.05 + speed01 * 0.08 : 0;
    engineGain.gain.setTargetAtTime(target, ctx.currentTime, 0.08);
    engineOsc.frequency.setTargetAtTime(55 + speed01 * 130, ctx.currentTime, 0.06);
  }

  /** The siren loop: on while any police car is close and the wanted level is up. */
  function siren(on) {
    if (!ensure()) return;
    if (!sirenOsc) {
      sirenOsc = ctx.createOscillator();
      sirenOsc.type = 'triangle';
      sirenOsc.frequency.value = 750;
      sirenGain = ctx.createGain();
      sirenGain.gain.value = 0;
      sirenLfo = ctx.createOscillator();
      sirenLfo.frequency.value = 1.4;
      const lfoGain = ctx.createGain();
      lfoGain.gain.value = 180;
      sirenLfo.connect(lfoGain).connect(sirenOsc.frequency);
      sirenOsc.connect(sirenGain).connect(master);
      sirenOsc.start();
      sirenLfo.start();
    }
    sirenGain.gain.setTargetAtTime(on && !muted ? 0.045 : 0, ctx.currentTime, 0.15);
  }

  return {
    unlock,
    toggleMute() {
      muted = !muted;
      if (master) master.gain.value = muted ? 0 : 0.5;
      return muted;
    },
    isMuted: () => muted,
    engine,
    siren,
    click: () => tone(660, 0.07, 'square', 0.08),
    punch: () => noise(0.09, 0.3, 900),
    hit: () => tone(140, 0.12, 'sine', 0.25, 60),
    crash: () => noise(0.25, 0.4, 500),
    cash: () => {
      tone(880, 0.09, 'sine', 0.15);
      setTimeout(() => tone(1320, 0.12, 'sine', 0.15), 70);
    },
    missionDone: () => {
      tone(523, 0.14, 'triangle', 0.2);
      setTimeout(() => tone(659, 0.14, 'triangle', 0.2), 120);
      setTimeout(() => tone(784, 0.22, 'triangle', 0.22), 240);
    },
    busted: () => tone(220, 0.5, 'sawtooth', 0.15, 90),
    wasted: () => tone(160, 0.7, 'sawtooth', 0.15, 50),
    horn: () => tone(370, 0.18, 'square', 0.1),
    door: () => noise(0.06, 0.15, 1200),
    heal: () => tone(520, 0.2, 'sine', 0.12, 780),
  };
}
