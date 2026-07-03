import { PROMPT_FADE_COMPLETE_SECONDS } from "../ui/StatsHud";

/** Spawns the player starts with, and the cap regeneration never exceeds. */
export const MAX_SPAWNS = 3;
/** Seconds between passive regeneration ticks while the population isn't extinct. */
export const REGEN_INTERVAL_SECONDS = 30;

/**
 * A limited, regenerating resource gating how many times the player can
 * click-to-spawn a new organism — a pacing mechanic layered on top of the
 * simulation, not part of the natural-selection model itself (which is why
 * it lives here in `src/app/` alongside the orchestration code, rather than
 * in `src/simulation/`).
 *
 * Starts full. Regenerates one every `REGEN_INTERVAL_SECONDS` while the
 * population isn't extinct, capped at `MAX_SPAWNS`. Refilled to full the
 * moment the "click somewhere to add a ball" prompt finishes fading in
 * after an extinction (`PROMPT_FADE_COMPLETE_SECONDS`, imported from
 * `StatsHud` so the two stay in lockstep) — not the instant extinction
 * happens, and not tied to whether/when the player actually spawns next.
 */
export class SpawnBudget {
  private count = MAX_SPAWNS;
  private regenTimer = 0;
  private refilledThisExtinction = false;

  update(dt: number, isExtinct: boolean, timeSinceExtinction: number): void {
    if (isExtinct) {
      if (!this.refilledThisExtinction && timeSinceExtinction >= PROMPT_FADE_COMPLETE_SECONDS) {
        this.count = MAX_SPAWNS;
        this.regenTimer = 0;
        this.refilledThisExtinction = true;
      }
      return;
    }
    this.refilledThisExtinction = false;

    if (this.count >= MAX_SPAWNS) {
      this.regenTimer = 0;
      return;
    }
    this.regenTimer += dt;
    if (this.regenTimer >= REGEN_INTERVAL_SECONDS) {
      this.regenTimer -= REGEN_INTERVAL_SECONDS;
      this.count = Math.min(MAX_SPAWNS, this.count + 1);
    }
  }

  /** Spends one spawn if any are left. Returns false (a no-op) if the budget is empty — the caller should block whatever action was gated on it. */
  tryConsume(): boolean {
    if (this.count <= 0) return false;
    this.count--;
    return true;
  }

  get remaining(): number {
    return this.count;
  }
}
