import type { Random } from "./Random";
import type { SimulationParameters } from "./Parameters";

/** A moving, deforming, born-and-dying metaball whose union defines the currently-viable trait region. */
export interface ViabilityBlob {
  id: number;

  /** trait-space units */
  x: number;
  /** trait-space units */
  y: number;
  /** trait-space units; target radius at full "hold" strength, before life-cycle envelope and wobble */
  radius: number;

  /** trait-space units/second, before the live `environmentDriftSpeed` multiplier; itself a persistent random-walk state, nudged by noise each `update()` */
  vx: number;
  /** trait-space units/second, before the live `environmentDriftSpeed` multiplier; itself a persistent random-walk state, nudged by noise each `update()` */
  vy: number;

  /** radians; fixed per-blob phase offset, combined with `phaseSpeed * time` for deterministic deformation */
  phase: number;
  /** radians/second, before the live `environmentDeformationSpeed` multiplier */
  phaseSpeed: number;

  /** fraction, 0–1; radius-wobble amplitude as a proportion of `radius`, before the live `environmentDeformationStrength` multiplier */
  deformationStrength: number;

  /** seconds; simulation time at which this blob started growing in from nothing */
  birthTime: number;
  /** seconds; duration of the grow-in ramp starting at `birthTime` */
  growDuration: number;
  /** seconds; duration of the shrink-out ramp ending at `birthTime + lifespan` */
  shrinkDuration: number;
  /** seconds; total time from birth to fully shrunk-away, including grow and shrink */
  lifespan: number;
}

export interface LandscapeBounds {
  width: number;
  height: number;
}

export const FIELD_THRESHOLD = 1;
const EPSILON = 1e-4;

/** How strongly a blob's heading random-walks each second (trait-space units/second, per sqrt-second of noise). */
const HEADING_NOISE = 0.35;
/** Hard cap on blob speed so the random walk can't run away. */
const MAX_SPEED = 0.6;

const GROW_DURATION_RANGE: [number, number] = [3, 6];
const SHRINK_DURATION_RANGE: [number, number] = [3, 6];
const HOLD_DURATION_RANGE: [number, number] = [12, 28];
/** Rough mean of grow+hold+shrink, used only to size the birth-rate so the population hovers near `viabilityBlobCount`. */
const AVERAGE_LIFESPAN = (GROW_DURATION_RANGE[0] + GROW_DURATION_RANGE[1]) / 2
  + (HOLD_DURATION_RANGE[0] + HOLD_DURATION_RANGE[1]) / 2
  + (SHRINK_DURATION_RANGE[0] + SHRINK_DURATION_RANGE[1]) / 2;
/** Loose ceiling on simultaneous blobs so a run of unlucky spawns can't grow the population unbounded. */
const MAX_POPULATION_SLACK = 1.5;

function smoothstep(edge0: number, edge1: number, x: number): number {
  const t = Math.min(1, Math.max(0, (x - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}

/**
 * Slow-moving, organic metaball field. Blob centers random-walk (a real
 * stochastic process, not a fixed straight-line drift) and blobs themselves
 * are born growing in from nothing and eventually shrink back out of
 * existence, replaced by new ones spawned at random times — so the set of
 * viable shapes keeps turning over rather than settling into a repeating
 * back-and-forth pattern. `isViable` is a strictly binary inside/outside
 * test; `fieldValue` exposes the continuous metaball sum purely for shading
 * the fitness-plane texture.
 */
export class Landscape {
  private blobs: ViabilityBlob[];
  private bounds: LandscapeBounds;
  private readonly rng: Random;
  private readonly targetBlobCount: number;
  private readonly blobRadiusMin: number;
  private readonly blobRadiusMax: number;
  private deformSpeed = 1;
  private deformStrength = 1;
  private elapsed = 0;
  private nextBlobId = 0;

  constructor(rng: Random, params: SimulationParameters, bounds: LandscapeBounds) {
    this.bounds = bounds;
    this.rng = rng;
    this.targetBlobCount = params.viabilityBlobCount;
    this.blobRadiusMin = params.viabilityBlobRadiusMin;
    this.blobRadiusMax = params.viabilityBlobRadiusMax;

    this.blobs = [];
    for (let i = 0; i < params.viabilityBlobCount; i++) {
      // Initial blobs start already fully grown (growDuration 0) so the
      // scene doesn't visibly "bloom" the moment the simulation starts.
      this.blobs.push(this.createBlob(0, 0));
    }
  }

  private createBlob(birthTime: number, growDuration?: number): ViabilityBlob {
    const halfW = this.bounds.width / 2;
    const halfH = this.bounds.height / 2;
    const angle = this.rng.range(0, Math.PI * 2);
    const speed = this.rng.range(0.15, 0.5);
    const grow = growDuration ?? this.rng.range(...GROW_DURATION_RANGE);
    const shrink = this.rng.range(...SHRINK_DURATION_RANGE);
    const hold = this.rng.range(...HOLD_DURATION_RANGE);

    return {
      id: this.nextBlobId++,
      x: this.rng.range(-halfW, halfW),
      y: this.rng.range(-halfH, halfH),
      radius: this.rng.range(this.blobRadiusMin, this.blobRadiusMax),
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      phase: this.rng.range(0, Math.PI * 2),
      phaseSpeed: this.rng.range(0.2, 0.6),
      deformationStrength: this.rng.range(0.15, 0.35),
      birthTime,
      growDuration: grow,
      shrinkDuration: shrink,
      lifespan: grow + hold + shrink,
    };
  }

  /**
   * Random-walks blob headings and drifts centers, removes blobs whose
   * life cycle has fully shrunk away, and stochastically spawns new ones so
   * shapes keep forming out of nothing and dissolving back into it. This is
   * the only place blob *population membership* changes; deformation and
   * the grow/shrink envelope themselves stay pure functions of the `time`
   * argument passed to `fieldValue`/`isViable`, keyed off each blob's fixed
   * `birthTime`.
   */
  update(dt: number, driftSpeed: number, deformSpeed: number, deformStrength: number): void {
    this.deformSpeed = deformSpeed;
    this.deformStrength = deformStrength;
    this.elapsed += dt;

    const halfW = this.bounds.width / 2;
    const halfH = this.bounds.height / 2;
    const margin = Math.max(0.5, halfW * 0.15);
    const restoring = 2;

    for (const blob of this.blobs) {
      // Heading is a persistent random walk (Brownian-ish), not a fixed
      // straight line — this is what keeps drift from settling into a
      // repeating back-and-forth bounce.
      blob.vx += this.rng.gaussian(0, HEADING_NOISE) * dt;
      blob.vy += this.rng.gaussian(0, HEADING_NOISE) * dt;

      const speed = Math.hypot(blob.vx, blob.vy);
      if (speed > MAX_SPEED) {
        blob.vx = (blob.vx / speed) * MAX_SPEED;
        blob.vy = (blob.vy / speed) * MAX_SPEED;
      }

      if (blob.x > halfW - margin) blob.vx -= (restoring * (blob.x - (halfW - margin))) / margin;
      if (blob.x < -halfW + margin) blob.vx += (restoring * (-halfW + margin - blob.x)) / margin;
      if (blob.y > halfH - margin) blob.vy -= (restoring * (blob.y - (halfH - margin))) / margin;
      if (blob.y < -halfH + margin) blob.vy += (restoring * (-halfH + margin - blob.y)) / margin;

      blob.x += blob.vx * driftSpeed * dt;
      blob.y += blob.vy * driftSpeed * dt;

      // Hard clamp as a safety net so blobs never escape the fitness space, even under large dt spikes.
      blob.x = Math.max(-halfW, Math.min(halfW, blob.x));
      blob.y = Math.max(-halfH, Math.min(halfH, blob.y));
    }

    // Shape turnover (birth/death) is paced by `deformSpeed`, the same knob
    // that governs how fast the wobble itself runs — both are "how quickly
    // does the environment change shape", as opposed to `driftSpeed` (how
    // fast shapes move around).
    this.blobs = this.blobs.filter((blob) => (this.elapsed - blob.birthTime) * deformSpeed < blob.lifespan);

    const maxBlobCount = Math.ceil(this.targetBlobCount * MAX_POPULATION_SLACK);
    if (this.blobs.length < maxBlobCount) {
      const spawnRatePerSecond = (this.targetBlobCount / AVERAGE_LIFESPAN) * deformSpeed;
      const spawnProbability = Math.min(1, spawnRatePerSecond * dt);
      if (this.rng.next() < spawnProbability) {
        this.blobs.push(this.createBlob(this.elapsed));
      }
    }
  }

  /** 0–1 grow-in/hold/shrink-out envelope; 0 outside the blob's lifespan, so it reads as forming from and dissolving into nothing. */
  private lifecycleEnvelope(blob: ViabilityBlob, time: number): number {
    const age = (time - blob.birthTime) * this.deformSpeed;
    if (age < 0) return 0;
    if (age < blob.growDuration) return smoothstep(0, blob.growDuration, age);
    const shrinkStart = blob.lifespan - blob.shrinkDuration;
    if (age < shrinkStart) return 1;
    if (age < blob.lifespan) return 1 - smoothstep(shrinkStart, blob.lifespan, age);
    return 0;
  }

  private effectiveRadius(blob: ViabilityBlob, time: number): number {
    const t = blob.phase + blob.phaseSpeed * this.deformSpeed * time;
    const wobble = blob.deformationStrength * this.deformStrength;
    // Two incommensurate harmonics instead of one clean sine, so the wobble
    // itself doesn't read as a single repeating back-and-forth cycle.
    const wave = 0.6 * Math.sin(t) + 0.4 * Math.sin(t * 1.7 + blob.phase * 0.5);
    const envelope = this.lifecycleEnvelope(blob, time);
    return blob.radius * envelope * (1 + wobble * wave);
  }

  fieldValue(x: number, y: number, time: number): number {
    let sum = 0;
    for (const blob of this.blobs) {
      const r = this.effectiveRadius(blob, time);
      if (r <= 0) continue;
      const dx = x - blob.x;
      const dy = y - blob.y;
      sum += (r * r) / (dx * dx + dy * dy + EPSILON);
    }
    return sum;
  }

  isViable(x: number, y: number, time: number): boolean {
    return this.fieldValue(x, y, time) >= FIELD_THRESHOLD;
  }

  /**
   * Continuous 0–1 "how deep inside a viable region" value, used to
   * gradually throttle growth near an edge without touching the hard
   * alive/dying boundary at `FIELD_THRESHOLD` itself: 1 once `fieldValue` is
   * at least `edgeFadeWidth` above the threshold (deep inside a shape),
   * ramping down to 0 right at the threshold line. `edgeFadeWidth <= 0`
   * reproduces the original binary behavior exactly — full fitness (1)
   * everywhere inside, 0 outside, no interior throttling.
   */
  fitnessAt(x: number, y: number, time: number, edgeFadeWidth: number): number {
    const field = this.fieldValue(x, y, time);
    if (edgeFadeWidth <= 0) return field >= FIELD_THRESHOLD ? 1 : 0;
    return Math.min(1, Math.max(0, (field - FIELD_THRESHOLD) / edgeFadeWidth));
  }

  getBlobs(): readonly ViabilityBlob[] {
    return this.blobs;
  }

  getBounds(): LandscapeBounds {
    return this.bounds;
  }

  /**
   * Updates the bounds blobs drift/clamp within (e.g. on window resize).
   * Existing blobs are left where they are — the containment logic in
   * `update()` will gently pull any now-out-of-range blob back in on the
   * next tick rather than teleporting it.
   */
  setBounds(bounds: LandscapeBounds): void {
    this.bounds = bounds;
  }

  /**
   * Rough, cheap environment metrics meant for driving audio (not visuals —
   * `FitnessPlane` samples `fieldValue` per-pixel for that). `coverageFraction`
   * sums each blob's own circular area and divides by the world's area; it
   * doesn't subtract overlap between blobs, so it's an overestimate when
   * blobs overlap, but that's fine for a smooth-and-cheap "how much of the
   * screen feels alive right now" signal rather than an exact figure.
   */
  getEnvironmentStats(time: number): { blobCount: number; averageRadius: number; coverageFraction: number } {
    if (this.blobs.length === 0) return { blobCount: 0, averageRadius: 0, coverageFraction: 0 };

    let totalRadius = 0;
    let totalArea = 0;
    for (const blob of this.blobs) {
      const r = Math.max(0, this.effectiveRadius(blob, time));
      totalRadius += r;
      totalArea += Math.PI * r * r;
    }

    const worldArea = this.bounds.width * this.bounds.height;
    return {
      blobCount: this.blobs.length,
      averageRadius: totalRadius / this.blobs.length,
      coverageFraction: worldArea > 0 ? Math.min(1, totalArea / worldArea) : 0,
    };
  }
}
