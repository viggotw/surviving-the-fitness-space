import type { Random } from "./Random";
import type { SimulationParameters } from "./Parameters";

/** A moving, deforming metaball whose union defines the currently-viable trait region. */
export interface ViabilityBlob {
  id: number;

  /** trait-space units */
  x: number;
  /** trait-space units */
  y: number;
  /** trait-space units */
  radius: number;

  /** trait-space units/second, before the live `environmentDriftSpeed` multiplier */
  vx: number;
  /** trait-space units/second, before the live `environmentDriftSpeed` multiplier */
  vy: number;

  /** radians; fixed per-blob phase offset, combined with `phaseSpeed * time` for deterministic deformation */
  phase: number;
  /** radians/second, before the live `environmentDeformationSpeed` multiplier */
  phaseSpeed: number;

  /** fraction, 0–1; radius-wobble amplitude as a proportion of `radius`, before the live `environmentDeformationStrength` multiplier */
  deformationStrength: number;
}

export interface LandscapeBounds {
  width: number;
  height: number;
}

const FIELD_THRESHOLD = 1;
const EPSILON = 1e-4;

/**
 * Slow-moving, organic metaball field. `isViable` is a strictly binary
 * inside/outside test; `fieldValue` exposes the continuous metaball sum
 * purely for shading the fitness-plane texture.
 */
export class Landscape {
  private readonly blobs: ViabilityBlob[];
  private readonly bounds: LandscapeBounds;
  private deformSpeed = 1;
  private deformStrength = 1;

  constructor(rng: Random, params: SimulationParameters, bounds: LandscapeBounds) {
    this.bounds = bounds;
    const halfW = bounds.width / 2;
    const halfH = bounds.height / 2;
    this.blobs = [];
    for (let i = 0; i < params.viabilityBlobCount; i++) {
      const angle = rng.range(0, Math.PI * 2);
      const speed = rng.range(0.15, 0.5);
      this.blobs.push({
        id: i,
        x: rng.range(-halfW, halfW),
        y: rng.range(-halfH, halfH),
        radius: rng.range(params.viabilityBlobRadiusMin, params.viabilityBlobRadiusMax),
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        phase: rng.range(0, Math.PI * 2),
        phaseSpeed: rng.range(0.2, 0.6),
        deformationStrength: rng.range(0.15, 0.35),
      });
    }
  }

  /** Drifts blob centers and applies soft containment; deformation itself is a pure function of time. */
  update(dt: number, driftSpeed: number, deformSpeed: number, deformStrength: number): void {
    this.deformSpeed = deformSpeed;
    this.deformStrength = deformStrength;

    const halfW = this.bounds.width / 2;
    const halfH = this.bounds.height / 2;
    const margin = Math.max(0.5, halfW * 0.15);
    const restoring = 2;

    for (const blob of this.blobs) {
      let vx = blob.vx;
      let vy = blob.vy;

      if (blob.x > halfW - margin) vx -= (restoring * (blob.x - (halfW - margin))) / margin;
      if (blob.x < -halfW + margin) vx += (restoring * (-halfW + margin - blob.x)) / margin;
      if (blob.y > halfH - margin) vy -= (restoring * (blob.y - (halfH - margin))) / margin;
      if (blob.y < -halfH + margin) vy += (restoring * (-halfH + margin - blob.y)) / margin;

      blob.x += vx * driftSpeed * dt;
      blob.y += vy * driftSpeed * dt;

      // Hard clamp as a safety net so blobs never escape the fitness space, even under large dt spikes.
      blob.x = Math.max(-halfW, Math.min(halfW, blob.x));
      blob.y = Math.max(-halfH, Math.min(halfH, blob.y));
    }
  }

  private effectiveRadius(blob: ViabilityBlob, time: number): number {
    const phase = blob.phase + blob.phaseSpeed * this.deformSpeed * time;
    const wobble = blob.deformationStrength * this.deformStrength;
    return blob.radius * (1 + wobble * Math.sin(phase));
  }

  fieldValue(x: number, y: number, time: number): number {
    let sum = 0;
    for (const blob of this.blobs) {
      const r = this.effectiveRadius(blob, time);
      const dx = x - blob.x;
      const dy = y - blob.y;
      sum += (r * r) / (dx * dx + dy * dy + EPSILON);
    }
    return sum;
  }

  isViable(x: number, y: number, time: number): boolean {
    return this.fieldValue(x, y, time) >= FIELD_THRESHOLD;
  }

  getBlobs(): readonly ViabilityBlob[] {
    return this.blobs;
  }

  getBounds(): LandscapeBounds {
    return this.bounds;
  }
}
