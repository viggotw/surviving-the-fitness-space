import type { Organism } from "../simulation/Organism";

const SPAWN_DURATION = 0.3;

export function easeInOut(t: number): number {
  return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
}

/** Combined growth + spawn-in + burst-pulse + death-shrink scale factor, in world units. */
export function displayScale(o: Organism): number {
  let scale = o.radius;

  if (o.age < SPAWN_DURATION) {
    scale *= easeInOut(Math.min(1, o.age / SPAWN_DURATION));
  }
  if (o.state === "bursting") {
    scale *= 1 + (1 - Math.max(0, o.opacity)) * 0.4;
  }
  if (o.state === "dying") {
    scale *= Math.max(0, o.opacity);
  }

  return Math.max(0.001, scale);
}

export function displayOpacity(o: Organism): number {
  return Math.max(0, Math.min(1, o.opacity));
}
