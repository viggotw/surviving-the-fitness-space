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

    this.landscape.update(dt, this.params.environmentDriftSpeed, this.params.environmentDeformationSpeed);

    const isViable = (x: number, y: number, t: number) => this.landscape.isViable(x, y, t);
    const offspringBuffer: Organism[] = [];

    for (const organism of this.organisms) {
      const offspring = updateOrganism(organism, dt, isViable, this._time, this.params, this.rng, this.nextId);
      for (const child of offspring) {
        if (this.organisms.length + offspringBuffer.length >= this.params.maxOrganisms) break;
        offspringBuffer.push(child);
      }
    }

    this.organisms.push(...offspringBuffer);
    this.organisms = this.organisms.filter((o) => !isRemovable(o));

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
    this.landscape = new Landscape(this.rng, this.params, this.bounds);
  }

  seedPopulation(count: number): void {
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

      this.organisms.push(createOrganism(this.nextId(), x, y, undefined, this.params, this.rng));
    }
  }

  setParams(partial: Partial<SimulationParameters>): void {
    Object.assign(this.params, clampParameters(partial));
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
}
