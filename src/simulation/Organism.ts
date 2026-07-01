import type { Random } from "./Random";
import type { SimulationParameters } from "./Parameters";

export type OrganismState = "alive" | "dying" | "bursting";

export type Organism = {
  id: number;
  parentId?: number;

  x: number;
  y: number;

  age: number;
  radius: number;
  opacity: number;

  growthRate: number;
  burstRadius: number;
  variationRadius: number;

  hue: number;

  state: OrganismState;
};

const BIRTH_RADIUS = 0.02;

function wrapHue(hue: number): number {
  return ((hue % 1) + 1) % 1;
}

export function mutate(value: number, mutationAmount: number, rng: Random, min = 0.001): number {
  return Math.max(min, value + rng.gaussian(0, mutationAmount));
}

/** Creates a root organism (no parent) or an offspring with heritable, mutated traits. */
export function createOrganism(
  id: number,
  x: number,
  y: number,
  parent: Organism | undefined,
  params: SimulationParameters,
  rng: Random,
): Organism {
  if (!parent) {
    return {
      id,
      x,
      y,
      age: 0,
      radius: BIRTH_RADIUS,
      opacity: 1,
      growthRate: Math.max(0.001, params.growthRate + rng.gaussian(0, params.growthRateVariation)),
      burstRadius: Math.max(0.03, params.burstRadius + rng.gaussian(0, params.burstRadiusVariation)),
      variationRadius: Math.max(0, params.variationRadius),
      hue: rng.next(),
      state: "alive",
    };
  }

  return {
    id,
    parentId: parent.id,
    x,
    y,
    age: 0,
    radius: BIRTH_RADIUS,
    opacity: 1,
    growthRate: mutate(parent.growthRate, params.growthRateMutation, rng),
    burstRadius: mutate(parent.burstRadius, params.burstRadiusMutation, rng, 0.03),
    variationRadius: mutate(parent.variationRadius, params.variationRadiusMutation, rng, 0),
    hue: wrapHue(parent.hue + rng.gaussian(0, params.hueMutation)),
    state: "alive",
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
  time: number,
  params: SimulationParameters,
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

    o.radius += o.growthRate * dt;

    if (o.radius >= o.burstRadius) {
      o.state = "bursting";
      const count = rng.int(params.offspringMin, params.offspringMax);
      for (let i = 0; i < count; i++) {
        const angle = rng.range(0, Math.PI * 2);
        const dist = rng.range(0, o.variationRadius);
        const ox = o.x + Math.cos(angle) * dist;
        const oy = o.y + Math.sin(angle) * dist;
        offspring.push(createOrganism(nextId(), ox, oy, o, params, rng));
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
