/** Half-extent of the fitness space along each axis; trait coordinates range roughly [-WORLD_SIZE, WORLD_SIZE]. */
export const WORLD_SIZE = 5;

export interface SimulationParameters {
  /** organisms */
  initialOrganisms: number;
  /** organisms */
  maxOrganisms: number;

  /** trait-space units of radius per second */
  growthRate: number;
  /** trait-space units/second (stddev applied once, to the initial population) */
  growthRateVariation: number;
  /** trait-space units/second (stddev applied per generation, parent → offspring) */
  growthRateMutation: number;

  /** trait-space units (radius); predefined size every organism grows to before bursting — controlled live via the panel */
  burstRadius: number;

  /** children per burst; predefined, exact count produced on every burst — controlled live via the panel */
  offspringCount: number;

  /** trait-space units (radius); max distance offspring spawn from their parent */
  variationRadius: number;
  /** trait-space units (stddev applied per generation, parent → offspring) */
  variationRadiusMutation: number;

  /** hue-wheel fraction, 0–1 (stddev applied per generation, parent → offspring) */
  hueMutation: number;

  /** unitless multiplier on each viability blob's base drift speed */
  environmentDriftSpeed: number;
  /** unitless multiplier on each viability blob's base radius-deformation rate */
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
  growthRateVariation: 0.002,
  growthRateMutation: 0.0008,

  burstRadius: 0.05,

  offspringCount: 3,

  variationRadius: 0.22,
  variationRadiusMutation: 0.02,

  hueMutation: 0.03,

  environmentDriftSpeed: 0.15,
  environmentDeformationSpeed: 0.2,
  environmentDeformationStrength: 0.3,

  viabilityBlobCount: 5,
  viabilityBlobRadiusMin: 0.7,
  viabilityBlobRadiusMax: 1.4,

  deathFadeDuration: 0.8,
  burstEffectDuration: 0.4,

  autoReseedOnExtinction: true,
  extinctionReseedDelay: 2,

  seed: "surviving-the-fitness-space",
};

export function clampParameters(p: Partial<SimulationParameters>): Partial<SimulationParameters> {
  const clamped: Partial<SimulationParameters> = { ...p };
  if (clamped.initialOrganisms !== undefined) clamped.initialOrganisms = Math.max(0, Math.floor(clamped.initialOrganisms));
  if (clamped.maxOrganisms !== undefined) clamped.maxOrganisms = Math.max(1, Math.floor(clamped.maxOrganisms));
  if (clamped.growthRate !== undefined) clamped.growthRate = Math.max(0.001, clamped.growthRate);
  if (clamped.burstRadius !== undefined) clamped.burstRadius = Math.max(0.01, clamped.burstRadius);
  if (clamped.offspringCount !== undefined) clamped.offspringCount = Math.max(1, Math.floor(clamped.offspringCount));
  if (clamped.variationRadius !== undefined) clamped.variationRadius = Math.max(0, clamped.variationRadius);
  if (clamped.viabilityBlobCount !== undefined) clamped.viabilityBlobCount = Math.max(1, Math.floor(clamped.viabilityBlobCount));
  return clamped;
}
