/** Half-extent of the fitness space along each axis; trait coordinates range roughly [-WORLD_SIZE, WORLD_SIZE]. */
export const WORLD_SIZE = 5;

export interface SimulationParameters {
  initialOrganisms: number;
  maxOrganisms: number;

  growthRate: number;
  growthRateVariation: number;
  growthRateMutation: number;

  burstRadius: number;
  burstRadiusVariation: number;
  burstRadiusMutation: number;

  offspringMin: number;
  offspringMax: number;

  variationRadius: number;
  variationRadiusMutation: number;

  hueMutation: number;

  environmentDriftSpeed: number;
  environmentDeformationSpeed: number;
  environmentDeformationStrength: number;

  viabilityBlobCount: number;
  viabilityBlobRadiusMin: number;
  viabilityBlobRadiusMax: number;

  deathFadeDuration: number;
  burstEffectDuration: number;

  autoReseedOnExtinction: boolean;
  extinctionReseedDelay: number;

  seed: number | string;
}

export const DEFAULT_PARAMETERS: SimulationParameters = {
  initialOrganisms: 40,
  maxOrganisms: 400,

  growthRate: 0.05,
  growthRateVariation: 0.02,
  growthRateMutation: 0.008,

  burstRadius: 0.15,
  burstRadiusVariation: 0.025,
  burstRadiusMutation: 0.012,

  offspringMin: 2,
  offspringMax: 3,

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
  if (clamped.offspringMin !== undefined) clamped.offspringMin = Math.max(1, Math.floor(clamped.offspringMin));
  if (clamped.offspringMax !== undefined) clamped.offspringMax = Math.max(1, Math.floor(clamped.offspringMax));
  if (clamped.variationRadius !== undefined) clamped.variationRadius = Math.max(0, clamped.variationRadius);
  if (clamped.viabilityBlobCount !== undefined) clamped.viabilityBlobCount = Math.max(1, Math.floor(clamped.viabilityBlobCount));
  return clamped;
}
