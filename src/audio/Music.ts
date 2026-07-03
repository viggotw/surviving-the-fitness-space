/**
 * A slow-shifting ambient pad, synthesized entirely with the Web Audio API
 * rather than loading a music file — there's no bundled audio asset in this
 * project (no licensing to track, nothing to fetch), so this generates its
 * own soft, continuously-drifting texture instead, in keeping with the
 * "lava-lamp" ambience of the drifting viable regions.
 *
 * Browsers block audio until a user gesture, so `start()` is meant to be
 * called from any first click/tap on the page; it's idempotent (safe to
 * call repeatedly, e.g. from multiple gesture listeners) and only actually
 * builds the audio graph once.
 */
export class Music {
  private ctx: AudioContext | null = null;
  private masterGain: GainNode | null = null;
  private muted = false;
  private readonly volume = 0.06;

  start(): void {
    if (this.ctx) {
      if (this.ctx.state === "suspended") void this.ctx.resume();
      return;
    }

    const ctx = new AudioContext();
    this.ctx = ctx;

    const master = ctx.createGain();
    master.gain.value = this.muted ? 0 : this.volume;
    master.connect(ctx.destination);
    this.masterGain = master;

    const filter = ctx.createBiquadFilter();
    filter.type = "lowpass";
    filter.frequency.value = 900;
    filter.connect(master);

    // A slow, drifting filter sweep so the texture never feels static or
    // mechanically looped.
    const filterLfo = ctx.createOscillator();
    filterLfo.frequency.value = 0.03;
    const filterLfoGain = ctx.createGain();
    filterLfoGain.gain.value = 350;
    filterLfo.connect(filterLfoGain).connect(filter.frequency);
    filterLfo.start();

    // A soft chord (root, fifth, octave, octave+fifth), each interval as a
    // pair of slightly detuned sines for a gentle chorus effect. Every voice
    // gets its own slow, independent amplitude swell (rather than a single
    // shared envelope) so voices drift in and out of prominence instead of
    // all swelling in lockstep.
    const rootHz = 110; // A2
    const intervals = [1, 1.5, 2, 3];
    for (const ratio of intervals) {
      for (const detune of [-4, 4]) {
        const osc = ctx.createOscillator();
        osc.type = "sine";
        osc.frequency.value = rootHz * ratio;
        osc.detune.value = detune;

        const voiceGain = ctx.createGain();
        voiceGain.gain.value = 0;
        osc.connect(voiceGain).connect(filter);

        // voiceGain.gain = swellOffset + swellLfo * swellDepth, both summed
        // directly into the AudioParam (Web Audio sums multiple inputs to a
        // param automatically) — a slow sine riding on a steady floor, so
        // the voice fades but never fully mutes.
        const swellOffset = ctx.createConstantSource();
        swellOffset.offset.value = 0.15;
        swellOffset.connect(voiceGain.gain);

        const swellLfo = ctx.createOscillator();
        swellLfo.frequency.value = 0.02 + Math.random() * 0.03;
        const swellDepth = ctx.createGain();
        swellDepth.gain.value = 0.15;
        swellLfo.connect(swellDepth).connect(voiceGain.gain);

        osc.start();
        swellOffset.start();
        swellLfo.start();
      }
    }
  }

  setMuted(muted: boolean): void {
    this.muted = muted;
    if (this.ctx && this.masterGain) {
      this.masterGain.gain.setTargetAtTime(muted ? 0 : this.volume, this.ctx.currentTime, 0.2);
    }
  }

  get isMuted(): boolean {
    return this.muted;
  }
}
