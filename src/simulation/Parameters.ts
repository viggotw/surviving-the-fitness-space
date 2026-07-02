/** Half-extent of the fitness space along each axis; trait coordinates range roughly [-WORLD_SIZE, WORLD_SIZE]. */
export const WORLD_SIZE = 5;

/** Floors enforced by `clampParameters`, exported so the Controls panel can build slider ranges around them without duplicating the numbers. */
export const MIN_GROWTH_RATE = 0.001;
export const MIN_BURST_RADIUS = 0.01;

export interface SimulationParameters {
  /** organisms */
  initialOrganisms: number;
  /** organisms */
  maxOrganisms: number;

  /**
   * trait-space units of radius per second; predefined, identical for every
   * organism (not heritable/mutated) — controlled live via the panel, same
   * as `burstRadius`. Growth and bursting are both fully deterministic
   * given an organism's age; the only randomness in the growth cycle is
   * `growthStartDelayMax` below.
   */
  growthRate: number;

  /** trait-space units (radius); predefined size every organism grows to before bursting — controlled live via the panel */
  burstRadius: number;

  /**
   * seconds; each organism, on spawning, waits a delay drawn uniformly from
   * [0, growthStartDelayMax] before it starts growing (radius holds at its
   * birth size until then). This is the *only* source of variation in
   * growth timing — with growth rate and burst radius both fully shared and
   * deterministic, a whole cohort born in the same tick (all offspring of
   * one burst, or the initial seed population) would otherwise grow and
   * burst in perfect lockstep forever, reading as the population "blinking"
   * in sync. Keep this small: it only needs to be large enough to break
   * that lockstep, not to visibly stagger growth.
   */
  growthStartDelayMax: number;

  /** children per burst; predefined, exact count produced on every burst — controlled live via the panel */
  offspringCount: number;

  /** trait-space units (radius); max distance offspring spawn from their parent */
  variationRadius: number;
  /** trait-space units (stddev applied per generation, parent → offspring) */
  variationRadiusMutation: number;

  /** hue-wheel fraction, 0–1 (stddev applied per generation, parent → offspring) */
  hueMutation: number;

  /** unitless multiplier on each viability blob's base drift (random-walk heading) speed */
  environmentDriftSpeed: number;
  /** unitless multiplier on each viability blob's base radius-wobble rate *and* its birth/grow/shrink/death lifecycle pacing */
  environmentDeformationSpeed: number;
  /** unitless multiplier on each viability blob's base radius-wobble amplitude */
  environmentDeformationStrength: number;

  /** blobs */
  viabilityBlobCount: number;
  /** trait-space units (radius) */
  viabilityBlobRadiusMin: number;
  /** trait-space units (radius) */
  viabilityBlobRadiusMax: number;

  /** seconds */
  deathFadeDuration: number;
  /** seconds */
  burstEffectDuration: number;

  autoReseedOnExtinction: boolean;
  /** seconds */
  extinctionReseedDelay: number;

  /** PRNG seed; no unit */
  seed: number | string;
}

export const DEFAULT_PARAMETERS: SimulationParameters = {
  initialOrganisms: 40,
  maxOrganisms: 600,

  growthRate: 0.005,

  burstRadius: 0.05,
  growthStartDelayMax: 0.5,

  offspringCount: 3,

  variationRadius: 0.22,
  variationRadiusMutation: 0.02,

  hueMutation: 0.03,

  environmentDriftSpeed: 0.3,
  environmentDeformationSpeed: 0.08,
  environmentDeformationStrength: 0.3,

  viabilityBlobCount: 5,
  viabilityBlobRadiusMin: 0.7,
  viabilityBlobRadiusMax: 1.4,

  deathFadeDuration: 0.8,
  burstEffectDuration: 0.4,

  autoReseedOnExtinction: false,
  extinctionReseedDelay: 2,

  seed: "surviving-the-fitness-space",
};

export function clampParameters(p: Partial<SimulationParameters>): Partial<SimulationParameters> {
  const clamped: Partial<SimulationParameters> = { ...p };
  if (clamped.initialOrganisms !== undefined) clamped.initialOrganisms = Math.max(0, Math.floor(clamped.initialOrganisms));
  if (clamped.maxOrganisms !== undefined) clamped.maxOrganisms = Math.max(1, Math.floor(clamped.maxOrganisms));
  if (clamped.growthRate !== undefined) clamped.growthRate = Math.max(MIN_GROWTH_RATE, clamped.growthRate);
  if (clamped.burstRadius !== undefined) clamped.burstRadius = Math.max(MIN_BURST_RADIUS, clamped.burstRadius);
  if (clamped.growthStartDelayMax !== undefined) clamped.growthStartDelayMax = Math.max(0, clamped.growthStartDelayMax);
  if (clamped.offspringCount !== undefined) clamped.offspringCount = Math.max(1, Math.floor(clamped.offspringCount));
  if (clamped.variationRadius !== undefined) clamped.variationRadius = Math.max(0, clamped.variationRadius);
  if (clamped.viabilityBlobCount !== undefined) clamped.viabilityBlobCount = Math.max(1, Math.floor(clamped.viabilityBlobCount));
  return clamped;
}
