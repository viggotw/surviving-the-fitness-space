import type { Organism } from "../simulation/Organism";

const SPAWN_DURATION = 0.3;

/** World units a dying organism drops before it's fully offscreen; falls with gravity-like acceleration. */
const FALL_DISTANCE = 20;

export function easeInOut(t: number): number {
  return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
}

/** Combined growth + spawn-in + burst-pulse scale factor, in world units. */
export function displayScale(o: Organism): number {
  let scale = o.radius;

  if (o.age < SPAWN_DURATION) {
    scale *= easeInOut(Math.min(1, o.age / SPAWN_DURATION));
  }
  if (o.state === "bursting") {
    scale *= 1 + (1 - Math.max(0, o.opacity)) * 0.4;
  }

  return Math.max(0.001, scale);
}

export function displayOpacity(o: Organism): number {
  return Math.max(0, Math.min(1, o.opacity));
}

/**
 * Downward world-space offset for an organism that has left the viable
 * region: it drops straight down out of view ("falls off the cliff") rather
 * than fading in place. `o.opacity` doubles as the death-progress timer
 * (1 → 0 over `deathFadeDuration`), so progress accelerates the same way a
 * fall under gravity would.
 */
export function displayFallOffset(o: Organism): number {
  if (o.state !== "dying") return 0;
  const progress = 1 - displayOpacity(o);
  return -FALL_DISTANCE * progress * progress;
}
