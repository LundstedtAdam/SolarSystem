// Procedural space audio, synthesized entirely with the Web Audio API — no
// asset files. A singleton, lazily initialized on the first user gesture
// (browsers block audio until then).
//
// Signal graph:
//   pad oscillators ─┐
//   noise bed ───────┤
//   proximity drone ─┤→ master gain → soft compressor → destination
//   ui sfx ──────────┘

import type { SurfaceAudioProfile } from './surfaceAudio';

class AudioManager {
  private ctx?: AudioContext;
  private master?: GainNode;
  private droneGain?: GainNode;
  private droneFilter?: BiquadFilterNode;
  private started = false;

  // Surface ambience graph (built lazily on first landing, reused after).
  private surfaceBus?: GainNode;
  private windGain?: GainNode;
  private windFilter?: BiquadFilterNode;
  private surfaceRumbleGain?: GainNode;
  private caveGain?: GainNode;
  private caveFilter?: BiquadFilterNode;

  private volume = 0.6;
  private muted = false;

  /** Create the context + ambient graph and resume (call from a user gesture). */
  resume() {
    if (!this.ctx) this.build();
    void this.ctx?.resume();
  }

  get isStarted() {
    return this.started;
  }

  private build() {
    const ctx = new AudioContext();
    this.ctx = ctx;

    const compressor = ctx.createDynamicsCompressor();
    compressor.threshold.value = -22;
    compressor.knee.value = 8;
    compressor.ratio.value = 3.5;
    compressor.attack.value = 0.005;
    compressor.release.value = 0.15;
    compressor.connect(ctx.destination);

    const master = ctx.createGain();
    master.gain.value = this.muted ? 0 : this.volume;
    master.connect(compressor);
    this.master = master;

    // --- Ambient pad: a low, slowly breathing chord (detuned oscillators). ---
    const padGain = ctx.createGain();
    padGain.gain.value = 0.0;
    const padFilter = ctx.createBiquadFilter();
    padFilter.type = 'lowpass';
    padFilter.frequency.value = 420;
    padFilter.Q.value = 0.7;
    padGain.connect(padFilter).connect(master);

    const padFreqs = [55, 82.41, 110, 164.81];
    padFreqs.forEach((f, i) => {
      const osc = ctx.createOscillator();
      osc.type = i % 2 === 0 ? 'sine' : 'triangle';
      osc.frequency.value = f;
      osc.detune.value = (i - 1.5) * 8;
      const g = ctx.createGain();
      g.gain.value = 0.15 / padFreqs.length;
      osc.connect(g).connect(padGain);
      osc.start();
    });

    const lfo = ctx.createOscillator();
    lfo.frequency.value = 0.04;
    const lfoGain = ctx.createGain();
    lfoGain.gain.value = 0.45;
    lfo.connect(lfoGain).connect(padGain.gain);
    lfo.start();
    padGain.gain.value = 0.55;

    // --- Noise bed: filtered white noise for a faint "space hiss". ---
    const noiseBuf = ctx.createBuffer(1, ctx.sampleRate * 4, ctx.sampleRate);
    const data = noiseBuf.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = (Math.random() * 2 - 1) * 0.5;
    const noise = ctx.createBufferSource();
    noise.buffer = noiseBuf;
    noise.loop = true;
    const noiseFilter = ctx.createBiquadFilter();
    noiseFilter.type = 'lowpass';
    noiseFilter.frequency.value = 550;
    const noiseGain = ctx.createGain();
    noiseGain.gain.value = 0.025;
    noise.connect(noiseFilter).connect(noiseGain).connect(master);
    noise.start();

    // --- Proximity drone: swells as the camera nears the sun / gas giants. ---
    const droneFilter = ctx.createBiquadFilter();
    droneFilter.type = 'lowpass';
    droneFilter.frequency.value = 120;
    const droneGain = ctx.createGain();
    droneGain.gain.value = 0;
    droneFilter.connect(droneGain).connect(master);
    [38, 57].forEach((f) => {
      const osc = ctx.createOscillator();
      osc.type = 'sawtooth';
      osc.frequency.value = f;
      const g = ctx.createGain();
      g.gain.value = 0.5;
      osc.connect(g).connect(droneFilter);
      osc.start();
    });
    this.droneGain = droneGain;
    this.droneFilter = droneFilter;

    this.started = true;
  }

  setMasterVolume(v: number) {
    this.volume = v;
    if (this.master && this.ctx) {
      this.master.gain.setTargetAtTime(this.muted ? 0 : v, this.ctx.currentTime, 0.05);
    }
  }

  setMuted(m: boolean) {
    this.muted = m;
    if (this.master && this.ctx) {
      this.master.gain.setTargetAtTime(m ? 0 : this.volume, this.ctx.currentTime, 0.05);
    }
  }

  /** 0 = far from everything, 1 = right next to the sun or a gas giant. */
  setProximity(p: number) {
    if (this.droneGain && this.droneFilter && this.ctx) {
      const t = this.ctx.currentTime;
      this.droneGain.gain.setTargetAtTime(p * 0.22, t, 0.35);
      this.droneFilter.frequency.setTargetAtTime(80 + p * 180, t, 0.35);
    }
  }

  // --- Surface ambience --------------------------------------------------

  /** Build the persistent surface graph once: wind (filtered noise) + rumble. */
  private buildSurface() {
    if (!this.ctx || !this.master || this.surfaceBus) return;
    const ctx = this.ctx;

    const bus = ctx.createGain();
    bus.gain.value = 0;
    bus.connect(this.master);
    this.surfaceBus = bus;

    // Wind: looping white noise through a low-pass whose cutoff sets density.
    const windBuf = ctx.createBuffer(1, ctx.sampleRate * 4, ctx.sampleRate);
    const wd = windBuf.getChannelData(0);
    for (let i = 0; i < wd.length; i++) wd[i] = (Math.random() * 2 - 1) * 0.5;
    const windSrc = ctx.createBufferSource();
    windSrc.buffer = windBuf;
    windSrc.loop = true;
    const windFilter = ctx.createBiquadFilter();
    windFilter.type = 'lowpass';
    windFilter.frequency.value = 600;
    windFilter.Q.value = 0.6;
    const windGain = ctx.createGain();
    windGain.gain.value = 0;
    windSrc.connect(windFilter).connect(windGain).connect(bus);
    windSrc.start();
    // Slow LFO so the wind breathes rather than sitting static.
    const windLfo = ctx.createOscillator();
    windLfo.frequency.value = 0.08;
    const windLfoGain = ctx.createGain();
    windLfoGain.gain.value = 0.4;
    windLfo.connect(windLfoGain).connect(windGain.gain);
    windLfo.start();
    this.windGain = windGain;
    this.windFilter = windFilter;

    // Rumble: two low sawtooths through a heavy low-pass.
    const rumbleFilter = ctx.createBiquadFilter();
    rumbleFilter.type = 'lowpass';
    rumbleFilter.frequency.value = 90;
    const rumbleGain = ctx.createGain();
    rumbleGain.gain.value = 0;
    rumbleFilter.connect(rumbleGain).connect(bus);
    [28, 41].forEach((f) => {
      const osc = ctx.createOscillator();
      osc.type = 'sawtooth';
      osc.frequency.value = f;
      const g = ctx.createGain();
      g.gain.value = 0.5;
      osc.connect(g).connect(rumbleFilter);
      osc.start();
    });
    this.surfaceRumbleGain = rumbleGain;

    // Cave drone: resonant low-pass noise + sub osc, swelled when underground.
    const caveFilter = ctx.createBiquadFilter();
    caveFilter.type = 'lowpass';
    caveFilter.frequency.value = 280;
    caveFilter.Q.value = 3.5;
    const caveGain = ctx.createGain();
    caveGain.gain.value = 0;
    caveFilter.connect(caveGain).connect(bus);
    const caveNoise = ctx.createBufferSource();
    caveNoise.buffer = windBuf;
    caveNoise.loop = true;
    const caveNoiseGain = ctx.createGain();
    caveNoiseGain.gain.value = 0.6;
    caveNoise.connect(caveNoiseGain).connect(caveFilter);
    caveNoise.start();
    const caveOsc = ctx.createOscillator();
    caveOsc.type = 'sine';
    caveOsc.frequency.value = 46;
    const caveOscGain = ctx.createGain();
    caveOscGain.gain.value = 0.5;
    caveOsc.connect(caveOscGain).connect(caveFilter);
    caveOsc.start();
    this.caveGain = caveGain;
    this.caveFilter = caveFilter;
  }

  /** 0 = open sky, 1 = deep underground/cave (swells a resonant low drone). */
  setCaveAmount(p: number) {
    if (this.caveGain && this.caveFilter && this.ctx) {
      const t = this.ctx.currentTime;
      this.caveGain.gain.setTargetAtTime(p * 0.18, t, 0.4);
      this.caveFilter.frequency.setTargetAtTime(240 + p * 220, t, 0.4);
    }
  }

  /** One footstep, tuned per surface material. */
  playFootstep(type: 'dust' | 'sand' | 'rock' | 'ice' | 'grass' | 'water') {
    const bus = this.surfaceBus;
    if (!this.ctx || !bus) return;
    const ctx = this.ctx;
    const t = ctx.currentTime;
    const cfg = {
      dust: { freq: 320, hp: false, dur: 0.12, gain: 0.05, thump: 60 },
      sand: { freq: 380, hp: false, dur: 0.13, gain: 0.05, thump: 52 },
      rock: { freq: 900, hp: false, dur: 0.08, gain: 0.07, thump: 80 },
      ice: { freq: 2600, hp: true, dur: 0.07, gain: 0.06, thump: 0 },
      grass: { freq: 520, hp: false, dur: 0.11, gain: 0.045, thump: 0 },
      water: { freq: 700, hp: false, dur: 0.2, gain: 0.07, thump: 38 },
    }[type];

    const dur = cfg.dur;
    const buf = ctx.createBuffer(1, Math.ceil(ctx.sampleRate * dur), ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / d.length);
    const src = ctx.createBufferSource();
    src.buffer = buf;
    const filter = ctx.createBiquadFilter();
    filter.type = cfg.hp ? 'highpass' : 'lowpass';
    filter.frequency.value = cfg.freq;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(cfg.gain, t + 0.005);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(filter).connect(g).connect(bus);
    src.start(t);
    src.stop(t + dur + 0.02);

    if (cfg.thump > 0) {
      const osc = ctx.createOscillator();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(cfg.thump, t);
      osc.frequency.exponentialRampToValueAtTime(cfg.thump * 0.6, t + 0.1);
      const og = ctx.createGain();
      og.gain.setValueAtTime(0.0001, t);
      og.gain.exponentialRampToValueAtTime(cfg.gain * 0.8, t + 0.01);
      og.gain.exponentialRampToValueAtTime(0.0001, t + 0.12);
      osc.connect(og).connect(bus);
      osc.start(t);
      osc.stop(t + 0.14);
    }
  }

  /** A soft repeating "chip" while hold-mining a voxel. Short filtered noise. */
  playMineTick() {
    const bus = this.surfaceBus;
    if (!this.ctx || !bus) return;
    const ctx = this.ctx;
    const t = ctx.currentTime;
    const dur = 0.06;
    const buf = ctx.createBuffer(1, Math.ceil(ctx.sampleRate * dur), ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / d.length);
    const src = ctx.createBufferSource();
    src.buffer = buf;
    const filter = ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.value = 1400 + Math.random() * 500;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.04, t + 0.004);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(filter).connect(g).connect(bus);
    src.start(t);
    src.stop(t + dur + 0.02);
  }

  /** A crunchier burst when a voxel finally breaks: noise + a low thump. */
  playMineBreak() {
    const bus = this.surfaceBus;
    if (!this.ctx || !bus) return;
    const ctx = this.ctx;
    const t = ctx.currentTime;
    const dur = 0.16;
    const buf = ctx.createBuffer(1, Math.ceil(ctx.sampleRate * dur), ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / d.length);
    const src = ctx.createBufferSource();
    src.buffer = buf;
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 1100;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.09, t + 0.006);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(filter).connect(g).connect(bus);
    src.start(t);
    src.stop(t + dur + 0.02);

    const osc = ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(110, t);
    osc.frequency.exponentialRampToValueAtTime(55, t + 0.14);
    const og = ctx.createGain();
    og.gain.setValueAtTime(0.0001, t);
    og.gain.exponentialRampToValueAtTime(0.07, t + 0.01);
    og.gain.exponentialRampToValueAtTime(0.0001, t + 0.16);
    osc.connect(og).connect(bus);
    osc.start(t);
    osc.stop(t + 0.18);
  }

  /** A short mechanical "thunk" when a block/structure is placed. */
  playPlace() {
    const bus = this.surfaceBus;
    if (!this.ctx || !bus) return;
    const ctx = this.ctx;
    const t = ctx.currentTime;
    const osc = ctx.createOscillator();
    osc.type = 'square';
    osc.frequency.setValueAtTime(220, t);
    osc.frequency.exponentialRampToValueAtTime(120, t + 0.08);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.05, t + 0.006);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.12);
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 900;
    osc.connect(lp).connect(g).connect(bus);
    osc.start(t);
    osc.stop(t + 0.14);
  }

  /** Oxygen warning chirp (Phase 11.4). Soft double-beep at 50%, an urgent,
   *  higher triple-beep at 25% when the final alarm takes over. */
  playOxygenWarning(urgent: boolean) {
    const bus = this.surfaceBus;
    if (!this.ctx || !bus) return;
    const ctx = this.ctx;
    const beeps = urgent ? 3 : 2;
    const freq = urgent ? 980 : 660;
    for (let i = 0; i < beeps; i++) {
      const t = ctx.currentTime + i * 0.18;
      const osc = ctx.createOscillator();
      osc.type = 'sine';
      osc.frequency.value = freq;
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(urgent ? 0.09 : 0.06, t + 0.012);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.12);
      osc.connect(g).connect(bus);
      osc.start(t);
      osc.stop(t + 0.14);
    }
  }

  /** One low heartbeat thump (Phase 11.4 final-minute alarm); intensity 0..1
   *  scales volume as the supply runs out. Called on a timer, not looped. */
  playHeartbeat(intensity: number) {
    const bus = this.surfaceBus;
    if (!this.ctx || !bus) return;
    const ctx = this.ctx;
    const t = ctx.currentTime;
    const v = 0.04 + 0.08 * Math.max(0, Math.min(1, intensity));
    for (const [dt, mul] of [
      [0, 1],
      [0.14, 0.6],
    ] as const) {
      const osc = ctx.createOscillator();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(64, t + dt);
      osc.frequency.exponentialRampToValueAtTime(40, t + dt + 0.1);
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, t + dt);
      g.gain.exponentialRampToValueAtTime(v * mul, t + dt + 0.015);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dt + 0.13);
      osc.connect(g).connect(bus);
      osc.start(t + dt);
      osc.stop(t + dt + 0.16);
    }
  }

  /** Fade in the surface soundscape for a given body. */
  startSurface(profile: SurfaceAudioProfile) {
    if (!this.ctx) return;
    this.buildSurface();
    const t = this.ctx.currentTime;
    this.surfaceBus?.gain.setTargetAtTime(1, t, 0.6);
    this.windGain?.gain.setTargetAtTime(profile.wind * 0.5, t, 0.8);
    if (this.windFilter) this.windFilter.frequency.setTargetAtTime(profile.windCutoff, t, 0.8);
    this.surfaceRumbleGain?.gain.setTargetAtTime(profile.rumble * 0.22, t, 0.8);
  }

  /** Fade the surface soundscape back out (on launch / ascent). */
  stopSurface() {
    if (!this.ctx || !this.surfaceBus) return;
    const t = this.ctx.currentTime;
    this.surfaceBus.gain.setTargetAtTime(0, t, 0.5);
    this.windGain?.gain.setTargetAtTime(0, t, 0.5);
    this.surfaceRumbleGain?.gain.setTargetAtTime(0, t, 0.5);
  }

  /** A single environmental texture hit (scheduled periodically by the driver). */
  playSurfaceTexture(type: 'ice' | 'volcanic' | 'geyser') {
    if (!this.ctx || !this.surfaceBus) return;
    const ctx = this.ctx;
    const t = ctx.currentTime;
    if (type === 'ice') {
      // Sharp brittle crack: short high-passed noise burst.
      const dur = 0.18;
      const buf = ctx.createBuffer(1, ctx.sampleRate * dur, ctx.sampleRate);
      const d = buf.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / d.length);
      const src = ctx.createBufferSource();
      src.buffer = buf;
      const filter = ctx.createBiquadFilter();
      filter.type = 'highpass';
      filter.frequency.value = 1800;
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.12, t + 0.005);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      src.connect(filter).connect(g).connect(this.surfaceBus);
      src.start(t);
      src.stop(t + dur + 0.02);
    } else if (type === 'volcanic') {
      // Deep gurgling thud: low sine with a downward pitch slide.
      const osc = ctx.createOscillator();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(70, t);
      osc.frequency.exponentialRampToValueAtTime(38, t + 0.5);
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.18, t + 0.05);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.6);
      osc.connect(g).connect(this.surfaceBus);
      osc.start(t);
      osc.stop(t + 0.65);
    } else {
      // Geyser: rising filtered-noise hiss.
      const dur = 1.2;
      const buf = ctx.createBuffer(1, ctx.sampleRate * dur, ctx.sampleRate);
      const d = buf.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
      const src = ctx.createBufferSource();
      src.buffer = buf;
      const filter = ctx.createBiquadFilter();
      filter.type = 'bandpass';
      filter.Q.value = 0.8;
      filter.frequency.setValueAtTime(600, t);
      filter.frequency.exponentialRampToValueAtTime(3000, t + dur);
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.07, t + 0.3);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      src.connect(filter).connect(g).connect(this.surfaceBus);
      src.start(t);
      src.stop(t + dur);
    }
  }

  /** World Richness Phase 8 — a single ambient wildlife call, scheduled
   *  periodically by a parallel driver (VoxelAudio.tsx) alongside (never
   *  replacing) the existing ice/volcanic/geyser texture scheduler, gated to
   *  the same bodies the visual wildlife layer appears on. Both variants are
   *  synthesized (no sample assets), same technique as playSurfaceTexture. */
  playWildlifeCall(kind: 'chirp' | 'drift') {
    if (!this.ctx || !this.surfaceBus) return;
    const ctx = this.ctx;
    const t = ctx.currentTime;
    if (kind === 'chirp') {
      // Earth birdsong/insect chirp: a quick upward pitch sweep.
      const dur = 0.14;
      const osc = ctx.createOscillator();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(1800 + Math.random() * 400, t);
      osc.frequency.exponentialRampToValueAtTime(2600 + Math.random() * 500, t + dur);
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.05, t + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      osc.connect(g).connect(this.surfaceBus);
      osc.start(t);
      osc.stop(t + dur + 0.02);
    } else {
      // Ambiguous-life "drifter" hum: slow, deliberately alien pitch wobble —
      // never a clear animal call, matching the visual's ambiguity.
      const dur = 1.6;
      const osc = ctx.createOscillator();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(180 + Math.random() * 40, t);
      const lfo = ctx.createOscillator();
      lfo.frequency.value = 0.6;
      const lfoGain = ctx.createGain();
      lfoGain.gain.value = 12;
      lfo.connect(lfoGain).connect(osc.frequency);
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.035, t + 0.4);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      osc.connect(g).connect(this.surfaceBus);
      osc.start(t);
      lfo.start(t);
      osc.stop(t + dur + 0.05);
      lfo.stop(t + dur + 0.05);
    }
  }

  // --- Descent / atmospheric entry --------------------------------------

  /** Rising filtered-noise sweep for atmospheric reentry (~3s swell + decay). */
  playReentry() {
    if (!this.ctx || !this.master) return;
    const ctx = this.ctx;
    const t = ctx.currentTime;
    const dur = 3.2;
    const buf = ctx.createBuffer(1, ctx.sampleRate * dur, ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
    const src = ctx.createBufferSource();
    src.buffer = buf;
    const filter = ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.Q.value = 0.7;
    filter.frequency.setValueAtTime(200, t);
    filter.frequency.exponentialRampToValueAtTime(4000, t + dur * 0.6);
    filter.frequency.exponentialRampToValueAtTime(600, t + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.16, t + dur * 0.4);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(filter).connect(g).connect(this.master);
    src.start(t);
    src.stop(t + dur);
  }

  /** Landing touchdown: a short low sine thud. */
  playLandingThud() {
    if (!this.ctx || !this.master) return;
    const ctx = this.ctx;
    const t = ctx.currentTime;
    const osc = ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(80, t);
    osc.frequency.exponentialRampToValueAtTime(45, t + 0.3);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.3, t + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.35);
    osc.connect(g).connect(this.master);
    osc.start(t);
    osc.stop(t + 0.4);
  }

  /** Gas-giant "unable to land" alarm: 3 descending triangle tones. */
  playGasGiantWarning() {
    if (!this.ctx || !this.master) return;
    for (let i = 0; i < 3; i++) {
      const start = (this.ctx?.currentTime ?? 0) + i * 0.5;
      this.blipAt(880, 0.35, 'triangle', 0.12, 220, start);
    }
  }

  // --- UI sound effects --------------------------------------------------

  private blip(freq: number, dur: number, type: OscillatorType, peak: number, slideTo?: number) {
    this.blipAt(freq, dur, type, peak, slideTo, this.ctx?.currentTime ?? 0);
  }

  private blipAt(
    freq: number,
    dur: number,
    type: OscillatorType,
    peak: number,
    slideTo: number | undefined,
    t: number,
  ) {
    if (!this.ctx || !this.master) return;
    const ctx = this.ctx;
    const osc = ctx.createOscillator();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t);
    if (slideTo) osc.frequency.exponentialRampToValueAtTime(slideTo, t + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(peak, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    osc.connect(g).connect(this.master);
    osc.start(t);
    osc.stop(t + dur + 0.02);
  }

  /** Selecting/focusing a body: a soft upward chime. */
  playSelect() {
    this.blip(523.25, 0.2, 'sine', 0.14, 880);
  }

  /** Toggling a control (pause, orbits, tour). */
  playToggle() {
    this.blip(330, 0.08, 'triangle', 0.09);
  }

  /** Camera transition whoosh: a short filtered-noise sweep. */
  playWhoosh() {
    if (!this.ctx || !this.master) return;
    const ctx = this.ctx;
    const t = ctx.currentTime;
    const dur = 0.5;
    const buf = ctx.createBuffer(1, ctx.sampleRate * dur, ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
    const src = ctx.createBufferSource();
    src.buffer = buf;
    const filter = ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.Q.value = 1.0;
    filter.frequency.setValueAtTime(250, t);
    filter.frequency.exponentialRampToValueAtTime(1600, t + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.08, t + 0.1);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(filter).connect(g).connect(this.master);
    src.start(t);
    src.stop(t + dur);
  }
}

export const audio = new AudioManager();
