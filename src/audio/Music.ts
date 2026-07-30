/**
 * All audio for the scene, synthesized entirely with the Web Audio API
 * rather than loading files — there's no bundled audio asset in this
 * project (no licensing to track, nothing to fetch). Three independent
 * pieces, each with its own volume bus merged into a single mute switch:
 *
 *  - The ambient pad (`start()`): a slow-shifting, organ-like chord (see
 *    `CHORD_INTERVALS`'s doc comment for the registration/voicing choices,
 *    `createReverbImpulse` for the generated cathedral reverb behind it),
 *    continuously modulated by `updateEnvironment()` to reflect the current
 *    viable regions' shapes/sizes/coverage — see that method's doc comment.
 *  - `playPop()`: a very quiet, short blip for an organism successfully
 *    bursting. Voice-capped so a burst of many simultaneous pops (organisms
 *    often burst in clusters) still reads as a soft shimmer, not noise —
 *    and each event's own volume additionally decays as population grows
 *    (see `SFX_DECAY_POPULATION`), since voice-capping alone only limits
 *    how many can sound *at once*, not how often new ones get triggered.
 *  - `playFall()`: a very quiet, short descending tone for an organism
 *    leaving a viable region and starting to fall. Same voice-capping and
 *    population-based decay.
 *
 * Browsers block audio until a user gesture, so `start()` is meant to be
 * called from any first click/tap on the page; it's idempotent (safe to
 * call repeatedly, e.g. from multiple gesture listeners) and only actually
 * builds the audio graph once. `playPop()`/`playFall()`/`updateEnvironment()`
 * are all safe to call before `start()` — they're just no-ops until then.
 */

/** Musical root, A2 — everything else is tuned relative to this. */
const ROOT_HZ = 110;
/**
 * Chord intervals above the root, modeled on a pipe organ's principal
 * chorus registration rather than an arbitrary pad voicing: a 16'-style
 * sub-octave for foundational weight, the 8' root and its fifth, the 4'
 * octave, and the 2⅔'/2' "mixture" pair (a twelfth and a fifteenth) on top
 * for that bright, shimmering sense of scale pipe organs get from stacking
 * many ranks. Deliberately open fifths/octaves throughout, no third — a
 * quintal, non-major/minor harmony reads as older/archetypal/timeless
 * rather than emotionally "happy" or "sad", closer to the intended
 * infinite/eternal feeling than a conventional chord would be.
 */
const CHORD_INTERVALS = [1, 1.5, 2, 3, 4];
/** The sub-octave (16'-style) stop, kept separate from CHORD_INTERVALS: voiced as a single undetuned low voice rather than a chorus pair (see buildAmbientPad) — detuning something this low produces a slow, muddy beating rather than a chorus shimmer. */
const SUB_OCTAVE_RATIO = 0.5;

/** Seconds of reverb tail — long and cathedral-like, for the "grand"/spacious quality that most reads as awe. */
const REVERB_SECONDS = 5;
/** Reverb decay curve exponent — higher falls off faster; keeps the (very long) tail from dominating so much it turns to mush. */
const REVERB_DECAY = 2.5;
/** How much of the reverb's output to mix back in alongside the dry signal. */
const REVERB_WET = 0.55;

/** Max simultaneous pop/fall voices — well above this and individual events would blur together into noise anyway, so excess triggers within the same brief window are simply skipped. */
const MAX_SFX_VOICES = 6;

/**
 * Population at which the pop/fall per-event volume bottoms out. A handful
 * of organisms is quiet enough that each pop/fall reads as a distinct,
 * pleasant event at full slider volume; by the time the population reaches
 * the hundreds, the *same* per-event volume would sum into a wall of noise
 * (voice-capping alone isn't enough — MAX_SFX_VOICES limits concurrent
 * voices, not how often new ones get triggered), so each event is scaled
 * down as population climbs.
 */
const SFX_DECAY_POPULATION = 100;
/** Exponent on the decay curve: pow(population/SFX_DECAY_POPULATION, this). >1 keeps volume near-full for small populations, then falls off increasingly steeply as it approaches SFX_DECAY_POPULATION — a "few balls" run barely decays at all, exactly the nonlinear, gradual-then-steep shape wanted here. */
const SFX_DECAY_EXPONENT = 2;
/** Floor as a *fraction of the current slider volume*, reached at SFX_DECAY_POPULATION — not an absolute value, so it stays proportional if the slider itself changes. At the pop slider's own default (0.08) this floor works out to ~0.005; fall has no floor at all, decaying to fully silent. */
const POP_VOLUME_FLOOR_FRACTION = 0.0625;
const FALL_VOLUME_FLOOR_FRACTION = 0;

/** 1 (no decay) at population 0, gliding down to floorFraction (of whatever the current slider volume is) by SFX_DECAY_POPULATION — see SFX_DECAY_POPULATION's doc comment for why. */
function sfxVolumeFactor(population: number, floorFraction: number): number {
  const t = Math.min(1, Math.max(0, population / SFX_DECAY_POPULATION));
  const remaining = 1 - Math.pow(t, SFX_DECAY_EXPONENT);
  return floorFraction + (1 - floorFraction) * remaining;
}

/** How often updateEnvironment() actually recomputes/re-targets audio params — the source stats change slowly, so there's no need to do this every frame. */
const ENV_UPDATE_INTERVAL_MS = 150;
/** Seconds for environment-driven parameters (filter cutoff, root pitch, density) to glide toward a new target — slow, so the sound drifts rather than visibly "follows" the sim tick-by-tick. */
const ENV_GLIDE_SECONDS = 3;

/**
 * Synthesizes a reverb impulse response (exponentially-decaying noise)
 * rather than loading a recorded one — same reasoning as everything else in
 * this module: no bundled audio asset. Independent noise per channel (not
 * the same buffer copied to both) so the reverb doesn't collapse to a
 * mono-sounding smear.
 */
function createReverbImpulse(ctx: AudioContext, seconds: number, decay: number): AudioBuffer {
  const length = Math.max(1, Math.floor(ctx.sampleRate * seconds));
  const impulse = ctx.createBuffer(2, length, ctx.sampleRate);
  for (let channel = 0; channel < impulse.numberOfChannels; channel++) {
    const data = impulse.getChannelData(channel);
    for (let i = 0; i < length; i++) {
      data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / length, decay);
    }
  }
  return impulse;
}

interface Voice {
  osc: OscillatorNode;
  ratio: number;
}

export class Music {
  private ctx: AudioContext | null = null;

  private masterGain: GainNode | null = null;
  private musicVolumeGain: GainNode | null = null;
  private popVolumeGain: GainNode | null = null;
  private fallVolumeGain: GainNode | null = null;
  private filter: BiquadFilterNode | null = null;
  private densityGain: GainNode | null = null;
  private voices: Voice[] = [];

  private muted = false;
  private musicVolume = 0.06;
  private popVolume = 0.08;
  private fallVolume = 0.08;

  private activePopVoices = 0;
  private activeFallVoices = 0;
  private lastEnvUpdateMs = -Infinity;

  start(): void {
    if (this.ctx) {
      if (this.ctx.state === "suspended") void this.ctx.resume();
      return;
    }

    const ctx = new AudioContext();
    this.ctx = ctx;

    const master = ctx.createGain();
    // A pure on/off switch — per-bus volumes (below) carry the actual levels,
    // so muting never has to remember/restore any of them.
    master.gain.value = this.muted ? 0 : 1;
    master.connect(ctx.destination);
    this.masterGain = master;

    this.musicVolumeGain = ctx.createGain();
    this.musicVolumeGain.gain.value = this.musicVolume;
    this.musicVolumeGain.connect(master);

    this.popVolumeGain = ctx.createGain();
    this.popVolumeGain.gain.value = this.popVolume;
    this.popVolumeGain.connect(master);

    this.fallVolumeGain = ctx.createGain();
    this.fallVolumeGain.gain.value = this.fallVolume;
    this.fallVolumeGain.connect(master);

    this.buildAmbientPad();
  }

  private buildAmbientPad(): void {
    const ctx = this.ctx;
    const musicVolumeGain = this.musicVolumeGain;
    if (!ctx || !musicVolumeGain) return;

    // blobCount modulates this — see updateEnvironment() — so the whole
    // chord's presence tracks how many viable regions currently exist.
    const densityGain = ctx.createGain();
    densityGain.gain.value = 1;
    densityGain.connect(musicVolumeGain);
    this.densityGain = densityGain;

    const filter = ctx.createBiquadFilter();
    filter.type = "lowpass";
    filter.frequency.value = 900;
    this.filter = filter;

    // A slow, drifting filter sweep so the texture never feels static or
    // mechanically looped — independent of (and layered on top of) the
    // environment-driven cutoff target in updateEnvironment().
    const filterLfo = ctx.createOscillator();
    filterLfo.frequency.value = 0.03;
    const filterLfoGain = ctx.createGain();
    filterLfoGain.gain.value = 350;
    filterLfo.connect(filterLfoGain).connect(filter.frequency);
    filterLfo.start();

    // Cathedral-scale reverb: the filtered chord is split into a dry path
    // and a wet path through a generated impulse response (createReverbImpulse
    // — no bundled IR file any more than there's a bundled music file), then
    // both are summed back into densityGain. This is the single biggest
    // contributor to the "grand"/spacious, organ-in-a-cathedral feeling — the
    // dry additive chord alone doesn't read as one.
    const dryGain = ctx.createGain();
    dryGain.gain.value = 1 - REVERB_WET;
    filter.connect(dryGain).connect(densityGain);

    const convolver = ctx.createConvolver();
    convolver.buffer = createReverbImpulse(ctx, REVERB_SECONDS, REVERB_DECAY);
    const wetGain = ctx.createGain();
    wetGain.gain.value = REVERB_WET;
    filter.connect(convolver).connect(wetGain).connect(densityGain);

    // The chord itself: a principal-chorus-style registration (see
    // CHORD_INTERVALS/SUB_OCTAVE_RATIO's doc comments) voiced with `triangle`
    // oscillators rather than pure sines — triangle's soft, fast-rolling-off
    // odd harmonics add a touch of pipe-like richness without turning harsh
    // the way a saw/square would. Every voice gets its own slow, independent
    // amplitude swell (rather than a single shared envelope) so voices drift
    // in and out of prominence instead of all swelling in lockstep.
    const addVoice = (ratio: number, detune: number, swellOffsetValue: number, swellDepthValue: number): void => {
      const osc = ctx.createOscillator();
      osc.type = "triangle";
      osc.frequency.value = ROOT_HZ * ratio;
      osc.detune.value = detune;

      const voiceGain = ctx.createGain();
      voiceGain.gain.value = 0;
      osc.connect(voiceGain).connect(filter);

      // voiceGain.gain = swellOffset + swellLfo * swellDepth, both summed
      // directly into the AudioParam (Web Audio sums multiple inputs to a
      // param automatically) — a slow sine riding on a steady floor, so
      // the voice fades but never fully mutes.
      const swellOffset = ctx.createConstantSource();
      swellOffset.offset.value = swellOffsetValue;
      swellOffset.connect(voiceGain.gain);

      const swellLfo = ctx.createOscillator();
      swellLfo.frequency.value = 0.02 + Math.random() * 0.03;
      const swellDepth = ctx.createGain();
      swellDepth.gain.value = swellDepthValue;
      swellLfo.connect(swellDepth).connect(voiceGain.gain);

      osc.start();
      swellOffset.start();
      swellLfo.start();

      this.voices.push({ osc, ratio });
    };

    // The 16'-style sub-octave: one undetuned low voice, not a chorus pair —
    // detuning something this low produces a slow, muddy beat instead of a
    // shimmer. Slightly louder floor (0.18 vs 0.1) since it's alone rather
    // than doubled, so it still reads as a felt foundation, not a whisper.
    addVoice(SUB_OCTAVE_RATIO, 0, 0.18, 0.1);

    for (const ratio of CHORD_INTERVALS) {
      for (const detune of [-4, 4]) {
        addVoice(ratio, detune, 0.1, 0.12);
      }
    }
  }

  /**
   * Modulates the ambient pad from the landscape's current shapes, so the
   * sound reflects what's on screen instead of looping unchanged forever:
   *
   *  - `coverageFraction` (how much of the world the viable regions cover)
   *    opens/closes the lowpass filter — more coverage reads as brighter.
   *  - `blobCount` scales `densityGain` — more simultaneous shapes reads as
   *    fuller/louder, fewer as sparser, independent of the user's music
   *    volume slider (which scales everything downstream of it).
   *  - `averageRadius` (normalized against `viabilityBlobRadiusMax`) shifts
   *    the chord's root pitch down as shapes get bigger, up as they shrink
   *    — bigger regions read as a deeper, more grounded tone.
   *
   * All three glide toward their new targets over `ENV_GLIDE_SECONDS`
   * rather than snapping, so the sound drifts rather than visibly "follows"
   * the sim tick-by-tick. Cheap to call every frame — internally throttled
   * to `ENV_UPDATE_INTERVAL_MS` since the underlying stats barely change
   * faster than that anyway.
   */
  updateEnvironment(stats: { blobCount: number; averageRadius: number; coverageFraction: number }, maxBlobRadius: number): void {
    const ctx = this.ctx;
    const filter = this.filter;
    const densityGain = this.densityGain;
    if (!ctx || !filter || !densityGain) return;

    const now = performance.now();
    if (now - this.lastEnvUpdateMs < ENV_UPDATE_INTERVAL_MS) return;
    this.lastEnvUpdateMs = now;

    const t = ctx.currentTime;

    const cutoffHz = 500 + Math.min(1, stats.coverageFraction * 4) * 3000;
    filter.frequency.setTargetAtTime(cutoffHz, t, ENV_GLIDE_SECONDS);

    // Loosely centered on a "typical" blob count of 5 without hard-coding
    // it — 0 blobs reads as noticeably sparser, more blobs fuller, clamped
    // so it's never silent nor overpoweringly loud on its own.
    const density = Math.min(1.2, Math.max(0.4, stats.blobCount / 5));
    densityGain.gain.setTargetAtTime(density, t, ENV_GLIDE_SECONDS);

    const bigness = maxBlobRadius > 0 ? Math.min(1, Math.max(0, stats.averageRadius / maxBlobRadius)) : 0;
    const rootMultiplier = 1.15 - bigness * 0.3;
    for (const voice of this.voices) {
      voice.osc.frequency.setTargetAtTime(ROOT_HZ * voice.ratio * rootMultiplier, t, ENV_GLIDE_SECONDS);
    }
  }

  /**
   * A very quiet, short blip for an organism successfully bursting.
   * `population` scales this specific event's volume down as it grows (see
   * `SFX_DECAY_POPULATION`) — independent of the pop volume slider, which
   * still sets the ceiling this decays from. No-op before start(), once
   * MAX_SFX_VOICES are already sounding, or once decayed close enough to
   * silent that building the audio nodes wouldn't be worth it.
   */
  playPop(population: number): void {
    const ctx = this.ctx;
    const bus = this.popVolumeGain;
    if (!ctx || !bus || this.activePopVoices >= MAX_SFX_VOICES) return;
    const peak = sfxVolumeFactor(population, POP_VOLUME_FLOOR_FRACTION);
    if (peak <= 0.001) return;
    this.activePopVoices++;

    const t = ctx.currentTime;
    const freq = 700 + Math.random() * 500;

    const osc = ctx.createOscillator();
    osc.type = "triangle";
    osc.frequency.setValueAtTime(freq, t);
    osc.frequency.exponentialRampToValueAtTime(freq * 1.6, t + 0.05);

    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0, t);
    gain.gain.linearRampToValueAtTime(peak, t + 0.008);
    gain.gain.exponentialRampToValueAtTime(0.001 * peak, t + 0.12);

    osc.connect(gain).connect(bus);
    osc.start(t);
    osc.stop(t + 0.13);
    osc.onended = () => {
      osc.disconnect();
      gain.disconnect();
      this.activePopVoices--;
    };
  }

  /**
   * A very quiet, short descending tone for an organism leaving a viable
   * region and starting to fall. `population` scales this specific event's
   * volume down as it grows (see `SFX_DECAY_POPULATION`) — independent of
   * the fall volume slider, which still sets the ceiling this decays from.
   * No-op before start(), once MAX_SFX_VOICES are already sounding, or once
   * decayed close enough to silent that building the audio nodes wouldn't
   * be worth it.
   */
  playFall(population: number): void {
    const ctx = this.ctx;
    const bus = this.fallVolumeGain;
    if (!ctx || !bus || this.activeFallVoices >= MAX_SFX_VOICES) return;
    const peak = sfxVolumeFactor(population, FALL_VOLUME_FLOOR_FRACTION);
    if (peak <= 0.001) return;
    this.activeFallVoices++;

    const t = ctx.currentTime;
    const startFreq = 420 + Math.random() * 160;

    const osc = ctx.createOscillator();
    osc.type = "sine";
    osc.frequency.setValueAtTime(startFreq, t);
    osc.frequency.exponentialRampToValueAtTime(startFreq * 0.35, t + 0.35);

    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0, t);
    gain.gain.linearRampToValueAtTime(peak, t + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.001 * peak, t + 0.4);

    osc.connect(gain).connect(bus);
    osc.start(t);
    osc.stop(t + 0.42);
    osc.onended = () => {
      osc.disconnect();
      gain.disconnect();
      this.activeFallVoices--;
    };
  }

  setMuted(muted: boolean): void {
    this.muted = muted;
    if (this.ctx && this.masterGain) {
      this.masterGain.gain.setTargetAtTime(muted ? 0 : 1, this.ctx.currentTime, 0.2);
    }
  }

  get isMuted(): boolean {
    return this.muted;
  }

  setMusicVolume(volume: number): void {
    this.musicVolume = volume;
    if (this.ctx && this.musicVolumeGain) {
      this.musicVolumeGain.gain.setTargetAtTime(volume, this.ctx.currentTime, 0.05);
    }
  }

  setPopVolume(volume: number): void {
    this.popVolume = volume;
    if (this.ctx && this.popVolumeGain) {
      this.popVolumeGain.gain.setTargetAtTime(volume, this.ctx.currentTime, 0.05);
    }
  }

  setFallVolume(volume: number): void {
    this.fallVolume = volume;
    if (this.ctx && this.fallVolumeGain) {
      this.fallVolumeGain.gain.setTargetAtTime(volume, this.ctx.currentTime, 0.05);
    }
  }

  get musicVolumeValue(): number {
    return this.musicVolume;
  }

  get popVolumeValue(): number {
    return this.popVolume;
  }

  get fallVolumeValue(): number {
    return this.fallVolume;
  }
}
