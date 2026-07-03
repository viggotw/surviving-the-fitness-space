import { Random } from "./Random";
import { Landscape, type LandscapeBounds } from "./Landscape";
import { createOrganism, updateOrganism, isRemovable, type Organism } from "./Organism";
import { DEFAULT_PARAMETERS, WORLD_SIZE, clampParameters, type SimulationParameters } from "./Parameters";

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

  paused = false;

  constructor(params: Partial<SimulationParameters> = {}) {
    this.params = { ...DEFAULT_PARAMETERS, ...clampParameters(params) };
    this.rng = new Random(this.params.seed);
    this.bounds = { width: WORLD_SIZE * 2, height: WORLD_SIZE * 2 };
    this.landscape = new Landscape(this.rng, this.params, this.bounds);
  }

  private nextId = (): number => this.nextIdCounter++;

  update(dt: number): void {
    if (this.paused) return;
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
      // Counted on the alive → bursting transition itself (once per
      // organism, not per tick it stays bursting) — a successful pop,
      // regardless of how many children actually cleared spawn-placement
      // and got born. Distinct from dying: a burst is reproduction, not death.
      if (wasAlive && organism.state === "bursting") this._burstCount++;
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
}
