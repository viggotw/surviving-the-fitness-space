/**
 * Minimal, read-only counters shown at the top of the scene — how many
 * organisms have successfully burst (popped into offspring; not merely
 * created, and not organisms that died instead), how many have died (from
 * leaving a viable region), how long the current run has lasted, and how
 * many spawns are left (see `SpawnBudget`). Below that, a large "click
 * somewhere to add a ball" prompt fades slowly in — like it's emerging out
 * of mist — `PROMPT_DELAY_SECONDS` after the population goes extinct, and
 * disappears the instant it isn't anymore. Purely a display of Simulation's
 * (and SpawnBudget's) own bookkeeping; computes nothing itself beyond
 * formatting and the fade timing.
 */

/** Seconds to wait after extinction before the prompt starts fading in. */
const PROMPT_DELAY_SECONDS = 2;
/** Seconds the fade-in itself takes, once it starts — slow and unhurried, to read as emerging rather than popping in. */
const PROMPT_FADE_DURATION_SECONDS = 2.5;
/** Blur (px) the prompt starts at before resolving into focus, for the "coming out of the mist" effect. */
const PROMPT_MIST_BLUR_PX = 18;

/**
 * When the prompt's fade-in is fully complete — the single source of truth
 * `SpawnBudget` uses to time its post-extinction refill, so the "spawns
 * left" counter finishes resetting exactly as the prompt finishes appearing
 * rather than on some independently-tuned delay that could drift out of sync.
 */
// export const PROMPT_FADE_COMPLETE_SECONDS = PROMPT_DELAY_SECONDS + PROMPT_FADE_DURATION_SECONDS;
export const PROMPT_FADE_COMPLETE_SECONDS = PROMPT_DELAY_SECONDS;

export class StatsHud {
  private readonly counters: HTMLElement;
  private readonly prompt: HTMLElement;
  private lastCountersText = "";
  private promptVisible = false;

  constructor(container: HTMLElement) {
    this.counters = document.createElement("div");
    this.counters.className = "stats-counters";
    container.appendChild(this.counters);

    this.prompt = document.createElement("div");
    this.prompt.className = "stats-prompt";
    this.prompt.textContent = "Click somewhere to add a ball";
    this.prompt.style.transition = `opacity ${PROMPT_FADE_DURATION_SECONDS}s ease, filter ${PROMPT_FADE_DURATION_SECONDS}s ease`;
    container.appendChild(this.prompt);
  }

  update(
    burstCount: number,
    deadCount: number,
    runTimeSeconds: number,
    spawnsLeft: number,
    isExtinct: boolean,
    timeSinceExtinction: number,
  ): void {
    const minutes = Math.floor(runTimeSeconds / 60);
    const seconds = Math.floor(runTimeSeconds % 60);
    const time = `${minutes}:${seconds.toString().padStart(2, "0")}`;
    const text = `Popped ${burstCount}    Dead ${deadCount}    Time ${time}    Spawns ${spawnsLeft}`;

    // Avoid touching the DOM every frame when nothing's actually changed.
    if (text !== this.lastCountersText) {
      this.counters.textContent = text;
      this.lastCountersText = text;
    }

    const shouldShowPrompt = isExtinct && timeSinceExtinction >= PROMPT_DELAY_SECONDS;
    if (shouldShowPrompt !== this.promptVisible) {
      this.promptVisible = shouldShowPrompt;
      this.prompt.style.opacity = shouldShowPrompt ? "1" : "0";
      this.prompt.style.filter = shouldShowPrompt ? "blur(0px)" : `blur(${PROMPT_MIST_BLUR_PX}px)`;
    }
  }
}
