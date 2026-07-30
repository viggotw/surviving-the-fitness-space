import { Random } from "./Random";
import { Landscape, type LandscapeBounds } from "./Landscape";
import { createOrganism, updateOrganism, isRemovable, type Organism } from "./Organism";
import { DEFAULT_PARAMETERS, WORLD_SIZE, clampParameters, type SimulationParameters } from "./Parameters";

/**
 * Largest `dt` any single simulation step is allowed to take, so a fast
 * `timeScale` adds *more* steps per frame rather than coarser ones — growth,
 * bursting, blob drift and the metaball field all stay as accurate at 10× as
 * they are at 1×. Matches the frame-loop clamp in `main.ts`.
 */
const MAX_SUBSTEP_DT = 1 / 20;
/** Hard ceiling on sub-steps per `update()` call, so a huge `dt` can't stall a frame. */
const MAX_SUBSTEPS = 16;
/** Ceiling on `timeScale`; the Controls panel builds its slider range from this. */
export const MAX_TIME_SCALE = 10;

/**
 * Owns the fitness landscape and the full organism population, and steps them
 * forward asynchronously by delta time. Contains no rendering or DOM concerns.
 */
export class Simulation {
  readonly params: SimulationParameters;

  private organisms: Organism[] = [];
  private landscape: Landscape;
  private rng: Random;
  private bounds: LandscapeBounds;
  private _time = 0;
  private nextIdCounter = 1;
  private extinctionTimer = 0;

  // Per-run scoreboard for the HUD — all three read as "how has *this* run
  // gone": each freezes/holds its value while extinct and resets together
  // (see beginRunIfEmpty()) the moment a new organism appears in an empty
  // population (seedPopulation or spawnOrganismAt after extinction), not
  // just on a full reset().
  private _burstCount = 0;
  private _deadCount = 0;
  private _runTime = 0;

  // Transient, per-tick event counts for sound effects — how many organisms
  // started bursting/dying *this* update() call specifically, not a running
  // total. Overwritten (not accumulated) at the top of every update(), so a
  // caller must read them right after calling update() to see this tick's
  // events before the next tick clears them. They do accumulate across the
  // sub-steps *within* one update() call, so a fast timeScale reports every
  // event it simulated rather than only the last sub-step's.
  private _burstsThisTick = 0;
  private _fallsThisTick = 0;

  paused = false;
  private _timeScale = 1;

  constructor(params: Partial<SimulationParameters> = {}) {
    this.params = { ...DEFAULT_PARAMETERS, ...clampParameters(params) };
    this.rng = new Random(this.params.seed);
    this.bounds = { width: WORLD_SIZE * 2, height: WORLD_SIZE * 2 };
    this.landscape = new Landscape(this.rng, this.params, this.bounds);
  }

  private nextId = (): number => this.nextIdCounter++;

  /**
   * Playback speed multiplier applied to every `update(dt)`, clamped to
   * `[0, MAX_TIME_SCALE]`. Transport, not biology: it scales how fast the whole
   * run is watched, not how any part of the model behaves relative to any
   * other, so nothing about the emergent dynamics changes with it — unlike the
   * environment sliders in `params`. 0 is equivalent to `paused`.
   */
  get timeScale(): number {
    return this._timeScale;
  }

  set timeScale(value: number) {
    this._timeScale = Math.max(0, Math.min(MAX_TIME_SCALE, value));
  }

  /**
   * Advances the run by `dt * timeScale`, split into however many sub-steps of
   * at most `MAX_SUBSTEP_DT` that takes. Sub-stepping (rather than handing the
   * whole scaled `dt` to one step) is what makes a fast `timeScale` a pure
   * fast-forward: every step is the same size it would be at 1×, so organisms
   * can't grow straight past their burst radius or blobs jump across the field
   * in a single tick.
   */
  update(dt: number): void {
    // Reset before the pause check: otherwise a paused tick would leave the
    // previous tick's events visible indefinitely, re-triggering the same
    // sound effects every frame while paused.
    this._burstsThisTick = 0;
    this._fallsThisTick = 0;
    if (this.paused) return;

    const scaled = dt * this._timeScale;
    if (scaled <= 0) return;
    const steps = Math.min(MAX_SUBSTEPS, Math.max(1, Math.ceil(scaled / MAX_SUBSTEP_DT)));
    const stepDt = scaled / steps;
    for (let i = 0; i < steps; i++) this.step(stepDt);
  }

  private step(dt: number): void {
    this._time += dt;
    // Checked *before* this tick's removals: runTime still advances through
    // the tick where the last organism finally dies, then freezes starting
    // next tick once the population is confirmed empty.
    if (this.organisms.length > 0) this._runTime += dt;

    this.landscape.update(
      dt,
      this.params.environmentDriftSpeed,
      this.params.environmentDeformationSpeed,
      this.params.environmentDeformationStrength,
    );

    const isViable = (x: number, y: number, t: number) => this.landscape.isViable(x, y, t);
    const fitnessAt = (x: number, y: number, t: number) =>
      this.landscape.fitnessAt(x, y, t, this.params.edgeFadeWidth);
    const offspringBuffer: Organism[] = [];

    for (const organism of this.organisms) {
      const wasAlive = organism.state === "alive";
      const offspring = updateOrganism(
        organism,
        dt,
        isViable,
        fitnessAt,
        this._time,
        this.params,
        this.bounds,
        this.rng,
        this.nextId,
        this.organisms,
      );
      // Counted on the alive → bursting/dying transition itself (once per
      // organism, not every tick it stays in that state) — a successful pop,
      // regardless of how many children actually cleared spawn-placement
      // and got born. Distinct from dying: a burst is reproduction, not death.
      if (wasAlive && organism.state === "bursting") {
        this._burstCount++;
        this._burstsThisTick++;
      }
      // "Falls" here means *starting* to fall (leaving a viable region), the
      // same instant the fall animation begins — not the eventual removal
      // deadCount tracks below, which happens only once the fade completes.
      if (wasAlive && organism.state === "dying") this._fallsThisTick++;
      offspringBuffer.push(...offspring);
    }

    // Every burst always produces its full, predefined offspringCount — the
    // population cap is enforced afterward by removing the oldest organisms
    // to make room, rather than silently truncating newly spawned offspring.
    const newbornIds = new Set(offspringBuffer.map((o) => o.id));
    this.organisms.push(...offspringBuffer);

    // Only count actual deaths (leaving a viable region) toward deadCount —
    // not organisms removed after successfully bursting (that's reproduction,
    // not death) or later evicted purely to enforce the population cap.
    for (const o of this.organisms) {
      if (o.state === "dying" && isRemovable(o)) this._deadCount++;
    }
    this.organisms = this.organisms.filter((o) => !isRemovable(o));

    const excess = this.organisms.length - this.params.maxOrganisms;
    if (excess > 0) {
      // Prefer removing the oldest organisms *near where this tick's new
      // growth happened*, falling back to the globally oldest only if a
      // local excess can't be found. A purely global oldest-first removal
      // would otherwise drain every other cluster in favor of whichever
      // lineage currently reproduces fastest, collapsing the whole
      // population into a single spot instead of many independent lineages.
      const localRadius = Math.max(this.params.variationRadius * 4, 1);
      const isNearNewGrowth = (o: Organism) =>
        offspringBuffer.some((child) => Math.hypot(o.x - child.x, o.y - child.y) <= localRadius);

      const candidates = this.organisms.filter((o) => !newbornIds.has(o.id));
      const toRemove = new Set<number>();

      const local = candidates.filter(isNearNewGrowth).sort((a, b) => a.age - b.age);
      for (const o of local) {
        if (toRemove.size >= excess) break;
        toRemove.add(o.id);
      }
      if (toRemove.size < excess) {
        const rest = candidates.filter((o) => !toRemove.has(o.id)).sort((a, b) => a.age - b.age);
        for (const o of rest) {
          if (toRemove.size >= excess) break;
          toRemove.add(o.id);
        }
      }
      // Last resort: if this tick's own new offspring alone outnumber the cap
      // (e.g. many simultaneous bursts against a very small maxOrganisms),
      // there is no non-newborn left to remove — the hard cap still wins.
      if (toRemove.size < excess) {
        for (const o of this.organisms) {
          if (toRemove.size >= excess) break;
          if (!toRemove.has(o.id)) toRemove.add(o.id);
        }
      }
      this.organisms = this.organisms.filter((o) => !toRemove.has(o.id));
    }

    if (this.organisms.length === 0) {
      this.extinctionTimer += dt;
      if (this.params.autoReseedOnExtinction && this.extinctionTimer >= this.params.extinctionReseedDelay) {
        this.seedPopulation(this.params.initialOrganisms);
        this.extinctionTimer = 0;
      }
    } else {
      this.extinctionTimer = 0;
    }
  }

  reset(seed?: number | string): void {
    if (seed !== undefined) this.params.seed = seed;
    this.rng = new Random(this.params.seed);
    this._time = 0;
    this.nextIdCounter = 1;
    this.extinctionTimer = 0;
    this.organisms = [];
    this._burstCount = 0;
    this._deadCount = 0;
    this._runTime = 0;
    this.landscape = new Landscape(this.rng, this.params, this.bounds);
  }

  /**
   * If the population is currently empty, a new run is about to begin —
   * reset the whole per-run scoreboard (runTime, burstCount, deadCount)
   * together. Unlike reset(), this happens on every extinction → respawn
   * cycle, not just on an explicit full reset.
   */
  private beginRunIfEmpty(): void {
    if (this.organisms.length === 0) {
      this._runTime = 0;
      this._burstCount = 0;
      this._deadCount = 0;
    }
  }

  seedPopulation(count: number): void {
    this.beginRunIfEmpty();
    const halfW = this.bounds.width / 2;
    const halfH = this.bounds.height / 2;
    for (let i = 0; i < count; i++) {
      if (this.organisms.length >= this.params.maxOrganisms) break;

      let x = 0;
      let y = 0;
      let tries = 0;
      do {
        x = this.rng.range(-halfW, halfW);
        y = this.rng.range(-halfH, halfH);
        tries++;
      } while (!this.landscape.isViable(x, y, this._time) && tries < 200);

      this.organisms.push(createOrganism(this.nextId(), x, y, undefined, this.params, this.bounds, this.rng));
    }
  }

  /**
   * Spawns a single root organism at an arbitrary point (e.g. a user click).
   * Reuses the same creation/lifecycle rules as everything else: if `(x, y)`
   * is outside the world bounds or a non-viable region, it becomes `dying`
   * immediately or on its first tick and falls away, exactly like any other
   * organism would. Always honors the request rather than silently no-oping
   * at the population cap — displaces the oldest organism to make room, same
   * as a burst would.
   */
  spawnOrganismAt(x: number, y: number): void {
    this.beginRunIfEmpty();
    if (this.organisms.length >= this.params.maxOrganisms) {
      let oldest = this.organisms[0];
      for (const o of this.organisms) {
        if (o.age > oldest.age) oldest = o;
      }
      this.organisms = this.organisms.filter((o) => o !== oldest);
    }
    this.organisms.push(createOrganism(this.nextId(), x, y, undefined, this.params, this.bounds, this.rng));
  }

  /**
   * Marks every organism as dying, so they fade and fall away exactly like
   * any other death (over `deathFadeDuration`, counted toward deadCount as
   * usual) rather than vanishing instantly — a quick way to end the current
   * run, e.g. right before starting a new one.
   */
  killAll(): void {
    for (const o of this.organisms) {
      if (o.state !== "dying") o.state = "dying";
    }
  }

  setParams(partial: Partial<SimulationParameters>): void {
    Object.assign(this.params, clampParameters(partial));
  }

  /** Updates the world's trait-space bounds (e.g. on window resize) and propagates them to the landscape. */
  setBounds(bounds: LandscapeBounds): void {
    this.bounds = bounds;
    this.landscape.setBounds(bounds);
  }

  getBounds(): LandscapeBounds {
    return this.bounds;
  }

  getOrganisms(): ReadonlyArray<Organism> {
    return this.organisms;
  }

  getLandscape(): Landscape {
    return this.landscape;
  }

  get time(): number {
    return this._time;
  }

  get population(): number {
    return this.organisms.length;
  }

  get isExtinct(): boolean {
    return this.organisms.length === 0;
  }

  /** Seconds since the population last hit zero; 0 while not extinct. */
  get timeSinceExtinction(): number {
    return this.extinctionTimer;
  }

  /** Total organisms that have successfully burst (popped into offspring) this run — not organisms merely created, and not organisms that died instead. Resets together with deadCount/runTime, see beginRunIfEmpty(). */
  get burstCount(): number {
    return this._burstCount;
  }

  /** Total organisms that died from leaving a viable region this run (not from bursting, not from population-cap eviction). Resets together with burstCount/runTime, see beginRunIfEmpty(). */
  get deadCount(): number {
    return this._deadCount;
  }

  /** Seconds the *current* run has lasted: frozen while extinct, restarted from 0 the moment a new organism appears in an empty population. */
  get runTime(): number {
    return this._runTime;
  }

  /** How many organisms started bursting on the most recent update() call — for sound effects. Overwritten every tick; read it right after calling update(). */
  get burstsThisTick(): number {
    return this._burstsThisTick;
  }

  /** How many organisms started falling (leaving a viable region) on the most recent update() call — for sound effects. Overwritten every tick; read it right after calling update(). */
  get fallsThisTick(): number {
    return this._fallsThisTick;
  }
}
