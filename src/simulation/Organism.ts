import type { Random } from "./Random";
import type { SimulationParameters } from "./Parameters";
import type { LandscapeBounds } from "./Landscape";

export type OrganismState = "alive" | "dying" | "bursting";

export type Organism = {
  id: number;
  parentId?: number;

  /** trait-space units */
  x: number;
  /** trait-space units */
  y: number;

  /** seconds since birth */
  age: number;
  /** trait-space units (radius) */
  radius: number;
  /** 0–1 */
  opacity: number;

  /**
   * seconds; drawn once at spawn from [0, params.growthStartDelayMax]. The
   * organism holds at its birth radius until `age` passes this, then grows
   * at the shared, deterministic `params.growthRate` — see updateOrganism.
   */
  spawnDelay: number;
  /** trait-space units (radius); heritable, mutated per generation */
  variationRadius: number;

  /** hue-wheel fraction, 0–1 (heritable, mutated per generation) */
  hue: number;

  state: OrganismState;
};

function wrapHue(hue: number): number {
  return ((hue % 1) + 1) % 1;
}

function isOutOfBounds(x: number, y: number, bounds: LandscapeBounds): boolean {
  return Math.abs(x) > bounds.width / 2 || Math.abs(y) > bounds.height / 2;
}

/**
 * Additive gaussian mutation with a *reflecting* floor: an undershoot below
 * `min` bounces back above it by the same distance, instead of being
 * absorbed onto `min` exactly. A hard `Math.max(min, ...)` clamp maps every
 * undershoot to the identical floor value, and over many generations that
 * piles up an ever-growing exact-duplicate spike — reflecting keeps the
 * distribution continuous instead.
 */
export function mutate(value: number, mutationAmount: number, rng: Random, min = 0.001): number {
  const raw = value + rng.gaussian(0, mutationAmount);
  return raw < min ? 2 * min - raw : raw;
}

/** Creates a root organism (no parent) or an offspring with heritable, mutated traits. */
export function createOrganism(
  id: number,
  x: number,
  y: number,
  parent: Organism | undefined,
  params: SimulationParameters,
  bounds: LandscapeBounds,
  rng: Random,
): Organism {
  if (!parent) {
    return {
      id,
      x,
      y,
      age: 0,
      radius: params.birthRadius,
      opacity: 1,
      spawnDelay: rng.range(0, params.growthStartDelayMax),
      variationRadius: Math.max(0, params.variationRadius),
      hue: rng.next(),
      state: isOutOfBounds(x, y, bounds) ? "dying" : "alive",
    };
  }

  return {
    id,
    parentId: parent.id,
    x,
    y,
    age: 0,
    radius: params.birthRadius,
    opacity: 1,
    spawnDelay: rng.range(0, params.growthStartDelayMax),
    variationRadius: mutate(parent.variationRadius, params.variationRadiusMutation, rng, 0),
    hue: wrapHue(parent.hue + rng.gaussian(0, params.hueMutation)),
    state: isOutOfBounds(x, y, bounds) ? "dying" : "alive",
  };
}

/**
 * Advances one organism by `dt`. Mutates `o` in place and returns any newly
 * spawned offspring (empty on most ticks). The caller is responsible for
 * appending offspring and enforcing the population cap.
 */
export function updateOrganism(
  o: Organism,
  dt: number,
  isViable: (x: number, y: number, time: number) => boolean,
  fitnessAt: (x: number, y: number, time: number) => number,
  time: number,
  params: SimulationParameters,
  bounds: LandscapeBounds,
  rng: Random,
  nextId: () => number,
): Organism[] {
  o.age += dt;
  const offspring: Organism[] = [];

  if (o.state === "alive") {
    if (!isViable(o.x, o.y, time)) {
      o.state = "dying";
      return offspring;
    }

    // Growth is fully deterministic and identical for every organism (the
    // live params.growthRate, not a per-organism trait) once its spawn
    // delay has elapsed — see the `spawnDelay` doc comment on Organism.
    // Grow only for the fraction of *this* tick that falls after the delay:
    // ticks are a coarse, shared grid (dt), so without this, every organism
    // whose continuous, distinct spawnDelay happens to fall in the same
    // dt-wide window would all start growing on the exact same tick and
    // produce bit-for-bit identical radii forever after — the delay's
    // randomness would be quantized away entirely.
    const ageBeforeTick = o.age - dt;
    if (o.age >= o.spawnDelay) {
      const growDuration = ageBeforeTick >= o.spawnDelay ? dt : o.age - o.spawnDelay;
      // Fitness (1 deep inside a viable region, ramping to 0 right at its
      // edge — see Landscape.fitnessAt) throttles growth near the boundary
      // without touching the alive/dying transition above, which still
      // flips at the same fixed threshold it always has.
      const fitness = fitnessAt(o.x, o.y, time);
      o.radius += params.growthRate * fitness * growDuration;
    }

    if (o.radius >= params.burstRadius) {
      o.state = "bursting";
      for (let i = 0; i < params.offspringCount; i++) {
        const angle = rng.range(0, Math.PI * 2);
        const dist = rng.range(0, o.variationRadius);
        const ox = o.x + Math.cos(angle) * dist;
        const oy = o.y + Math.sin(angle) * dist;
        offspring.push(createOrganism(nextId(), ox, oy, o, params, bounds, rng));
      }
    }
    return offspring;
  }

  if (o.state === "bursting") {
    o.opacity -= dt / Math.max(params.burstEffectDuration, 0.0001);
    return offspring;
  }

  // o.state === "dying"
  o.opacity -= dt / Math.max(params.deathFadeDuration, 0.0001);
  return offspring;
}

export function isRemovable(o: Organism): boolean {
  return (o.state === "dying" || o.state === "bursting") && o.opacity <= 0;
}
