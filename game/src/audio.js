// Every sound in SKYHAUL is made, not played: there are no audio files. A WebAudio graph built on
// the first key press or click (browsers insist on a gesture) holds an engine — two detuned
// oscillators through a low-pass filter, their pitch following the throttle — and a wind loop of
// filtered noise that rises with speed. Over that, small synthesised voices speak for the events:
// a two-note chime for a ring, a low thud for a touchdown, a crunch for a crash, a click for the
// interface. M mutes the master gain; nothing here ever loads a file.

export function createAudio() {
  let ctx = null;
  let master = null;
  let engineOsc = null;
  let engineSub = null;
  let engineGain = null;
  let windGain = null;
  let windFilter = null;
  let muted = false;

  /** Build the graph. Safe to call twice; the second call just wakes the context. */
  function ensure() {
    if (ctx) {
      if (ctx.state === 'suspended') ctx.resume();
      return;
    }
    const AudioContext = window.AudioContext || window.webkitAudioContext;
    if (!AudioContext) return;
    ctx = new AudioContext();
    master = ctx.createGain();
    master.gain.value = muted ? 0 : 0.5;
    master.connect(ctx.destination);

    // The engine: a sawtooth and a sine an octave under it, muffled by a low-pass filter.
    const engineFilter = ctx.createBiquadFilter();
    engineFilter.type = 'lowpass';
    engineFilter.frequency.value = 420;
    engineGain = ctx.createGain();
    engineGain.gain.value = 0;
    engineOsc = ctx.createOscillator();
    engineOsc.type = 'sawtooth';
    engineOsc.frequency.value = 58;
    engineSub = ctx.createOscillator();
    engineSub.type = 'sine';
    engineSub.frequency.value = 29;
    engineOsc.connect(engineFilter);
    engineSub.connect(engineFilter);
    engineFilter.connect(engineGain);
    engineGain.connect(master);
    engineOsc.start();
    engineSub.start();

    // The wind: a looped buffer of white noise through a band-pass that opens with speed.
    const length = ctx.sampleRate;
    const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < length; i++) data[i] = Math.random() * 2 - 1;
    const noise = ctx.createBufferSource();
    noise.buffer = buffer;
    noise.loop = true;
    windFilter = ctx.createBiquadFilter();
    windFilter.type = 'bandpass';
    windFilter.frequency.value = 500;
    windFilter.Q.value = 0.6;
    windGain = ctx.createGain();
    windGain.gain.value = 0;
    noise.connect(windFilter);
    windFilter.connect(windGain);
    windGain.connect(master);
    noise.start();
  }

  /** A short tone with an envelope: the building block of the chime, thud and click. */
  function tone(freq, dur, type, gain, when = 0, slideTo = null) {
    if (!ctx) return;
    const t0 = ctx.currentTime + when;
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t0);
    if (slideTo) osc.frequency.exponentialRampToValueAtTime(slideTo, t0 + dur);
    g.gain.setValueAtTime(0, t0);
    g.gain.linearRampToValueAtTime(gain, t0 + 0.012);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    osc.connect(g);
    g.connect(master);
    osc.start(t0);
    osc.stop(t0 + dur + 0.05);
  }

  /** A burst of the noise buffer through a low-pass: the body of the thud and the crash. */
  function noiseBurst(dur, gain, cutoff) {
    if (!ctx) return;
    const t0 = ctx.currentTime;
    const src = ctx.createBufferSource();
    const length = Math.floor(ctx.sampleRate * dur);
    const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < length; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / length);
    src.buffer = buffer;
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = cutoff;
    const g = ctx.createGain();
    g.gain.value = gain;
    src.connect(filter);
    filter.connect(g);
    g.connect(master);
    src.start(t0);
  }

  return {
    ensure,
    /** The running sound of flight, called every frame: engine by throttle, wind by speed. */
    update(ac, flying) {
      if (!ctx) return;
      const t = ctx.currentTime;
      const rpm = ac.engineOut ? 0 : ac.throttle;
      const engineTarget = flying || ac.phase === 'ground' ? 0.028 + rpm * 0.11 : 0;
      engineGain.gain.setTargetAtTime(engineTarget, t, 0.09);
      engineOsc.frequency.setTargetAtTime(52 + rpm * 82 + ac.speed * 0.18, t, 0.09);
      engineSub.frequency.setTargetAtTime(26 + rpm * 41, t, 0.09);
      const wind = Math.pow(Math.min(ac.speed / 70, 1), 2) * (ac.phase === 'air' ? 0.2 : 0.015);
      windGain.gain.setTargetAtTime(wind, t, 0.12);
      windFilter.frequency.setTargetAtTime(420 + ac.speed * 13, t, 0.12);
    },
    /** The ring chime: two bright notes, the second a fourth above the first. */
    chime() {
      tone(880, 0.22, 'sine', 0.16);
      tone(1174.7, 0.34, 'sine', 0.14, 0.07);
    },
    /** A touchdown: a low thud whose weight follows the sink rate. */
    thud(hardness) {
      tone(72, 0.28, 'sine', 0.22 + hardness * 0.2, 0, 38);
      noiseBurst(0.16, 0.1 + hardness * 0.14, 500);
    },
    /** A crash: a crunch and a falling boom. */
    crash() {
      noiseBurst(0.55, 0.3, 900);
      tone(110, 0.7, 'sawtooth', 0.16, 0, 30);
    },
    /** A warning warble for the stall, short enough to repeat without nagging. */
    warble() {
      tone(620, 0.09, 'square', 0.05);
      tone(620, 0.09, 'square', 0.05, 0.13);
    },
    /** The interface click. */
    click() {
      tone(1250, 0.05, 'square', 0.06);
    },
    /** Toggle the master mute; returns the new state. */
    toggleMute() {
      muted = !muted;
      if (master) master.gain.setTargetAtTime(muted ? 0 : 0.5, ctx.currentTime, 0.03);
      return muted;
    },
    get muted() {
      return muted;
    },
  };
}
