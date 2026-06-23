// Procedural space audio, synthesized entirely with the Web Audio API — no
// asset files. A singleton, lazily initialized on the first user gesture
// (browsers block audio until then).
//
// Signal graph:
//   pad oscillators ─┐
//   noise bed ───────┤
//   proximity drone ─┤→ master gain → soft compressor → destination
//   ui sfx ──────────┘

class AudioManager {
  private ctx?: AudioContext;
  private master?: GainNode;
  private droneGain?: GainNode;
  private droneFilter?: BiquadFilterNode;
  private started = false;

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

  // --- UI sound effects --------------------------------------------------

  private blip(freq: number, dur: number, type: OscillatorType, peak: number, slideTo?: number) {
    if (!this.ctx || !this.master) return;
    const ctx = this.ctx;
    const t = ctx.currentTime;
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
