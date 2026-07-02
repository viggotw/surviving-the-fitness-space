import { Pane } from "tweakpane";
import type { Simulation } from "../simulation/Simulation";
import { MIN_BIRTH_RADIUS, MIN_BURST_RADIUS, MIN_GROWTH_RATE, WORLD_SIZE } from "../simulation/Parameters";

/**
 * Raw trait-space units (`Parameters.ts`'s stable numeric contract, e.g.
 * `burstRadius: 0.05`) read as tiny, unintuitive decimals to a user. This
 * panel instead displays organism sizes as a percentage of the fitness
 * space's half-width (`WORLD_SIZE`), so "burst radius 1%" reads naturally
 * as "1% of the play area" — only the display/edit layer is rescaled;
 * `Simulation`/`Parameters` still store and consume raw trait-space units.
 */
const SIZE_DISPLAY_SCALE = 100 / WORLD_SIZE;
const toDisplaySize = (raw: number): number => raw * SIZE_DISPLAY_SCALE;
const fromDisplaySize = (display: number): number => display / SIZE_DISPLAY_SCALE;

/** A range with `min` fixed and `max` solved so `value` sits exactly at the midpoint — keeps the slider lever centered on the current default. */
function centeredFromMin(value: number, min: number): { min: number; max: number } {
  return { min, max: 2 * value - min };
}

/** A range with `max` fixed and `min` solved so `value` sits exactly at the midpoint. */
function centeredFromMax(value: number, max: number): { min: number; max: number } {
  return { min: 2 * value - max, max };
}

interface ControlsState {
  playing: boolean;
  seedCount: number;
  environmentDriftSpeed: number;
  environmentDeformationSpeed: number;
  environmentDeformationStrength: number;
  edgeFadeWidth: number;
  /** % of WORLD_SIZE — see SIZE_DISPLAY_SCALE */
  variationRadius: number;
  /** % of WORLD_SIZE per second — see SIZE_DISPLAY_SCALE */
  growthRate: number;
  /** % of WORLD_SIZE — see SIZE_DISPLAY_SCALE */
  birthRadius: number;
  /** % of WORLD_SIZE — see SIZE_DISPLAY_SCALE */
  burstRadius: number;
  growthStartDelayMax: number;
  offspringCount: number;
  spawnClearanceFactor: number;
  maxOrganisms: number;
  population: number;
  autoReseedOnExtinction: boolean;
}

/**
 * Minimal dev/debug control panel (spec 7.2 subset), built on Tweakpane.
 * Grouped into folders so it's clear at a glance what each section governs:
 * the environment (the moving viable regions), the organisms (growth/
 * reproduction), and overall population bookkeeping.
 */
export class Controls {
  private readonly pane: Pane;
  private readonly state: ControlsState;
  private readonly simulation: Simulation;

  constructor(container: HTMLElement, simulation: Simulation, onReset: () => void) {
    this.simulation = simulation;
    this.pane = new Pane({ container, title: "Controls", expanded: false });
    const p = simulation.params;

    this.state = {
      playing: !simulation.paused,
      seedCount: p.initialOrganisms,
      environmentDriftSpeed: p.environmentDriftSpeed,
      environmentDeformationSpeed: p.environmentDeformationSpeed,
      environmentDeformationStrength: p.environmentDeformationStrength,
      edgeFadeWidth: p.edgeFadeWidth,
      variationRadius: toDisplaySize(p.variationRadius),
      growthRate: toDisplaySize(p.growthRate),
      birthRadius: toDisplaySize(p.birthRadius),
      burstRadius: toDisplaySize(p.burstRadius),
      growthStartDelayMax: p.growthStartDelayMax,
      offspringCount: p.offspringCount,
      spawnClearanceFactor: p.spawnClearanceFactor,
      maxOrganisms: p.maxOrganisms,
      population: simulation.population,
      autoReseedOnExtinction: p.autoReseedOnExtinction,
    };

    // Global transport controls.
    this.pane
      .addBinding(this.state, "playing", { label: "Play / Pause" })
      .on("change", (ev) => {
        simulation.paused = !ev.value;
      });
    this.pane.addButton({ title: "Reset" }).on("click", () => onReset());

    // Environment: governs the moving/deforming viable regions (the "lava-lamp" pattern).
    // Every slider range below is solved so today's default sits at the
    // lever's center — pushing left slows/shrinks it, right speeds/grows it.
    const environment = this.pane.addFolder({ title: "Environment", expanded: true });
    environment
      .addBinding(this.state, "environmentDriftSpeed", {
        label: "Drift speed (×)",
        ...centeredFromMin(p.environmentDriftSpeed, 0),
        step: 0.005,
      })
      .on("change", (ev) => simulation.setParams({ environmentDriftSpeed: ev.value }));
    environment
      .addBinding(this.state, "environmentDeformationSpeed", {
        label: "Deform speed (×)",
        ...centeredFromMin(p.environmentDeformationSpeed, 0),
        step: 0.005,
      })
      .on("change", (ev) => simulation.setParams({ environmentDeformationSpeed: ev.value }));
    environment
      // Each blob's own wobble amplitude tops out at 0.35, so once this
      // multiplier crosses ~2.86× the `1 + wobble * wave` term can cross
      // zero and the effective radius flips sign. The centered range below
      // stays well under that regardless of the current default.
      .addBinding(this.state, "environmentDeformationStrength", {
        label: "Deform strength (×)",
        ...centeredFromMin(p.environmentDeformationStrength, 0),
        step: 0.01,
      })
      .on("change", (ev) => simulation.setParams({ environmentDeformationStrength: ev.value }));
    environment
      // 0 reproduces the original hard binary edge exactly (no interior
      // throttling); higher values widen the interior band near a shape's
      // edge where growth gradually throttles toward 0, without moving the
      // actual alive/dying boundary itself.
      .addBinding(this.state, "edgeFadeWidth", {
        label: "Edge fading",
        min: 0,
        max: 3,
        step: 0.05,
      })
      .on("change", (ev) => simulation.setParams({ edgeFadeWidth: ev.value }));

    // Organisms: governs individual growth, reproduction, and heritable variation.
    const organisms = this.pane.addFolder({ title: "Organisms", expanded: true });
    organisms
      .addBinding(this.state, "growthRate", {
        label: "Growth rate (%/s)",
        ...centeredFromMin(this.state.growthRate, toDisplaySize(MIN_GROWTH_RATE)),
        step: 0.01,
      })
      .on("change", (ev) => simulation.setParams({ growthRate: fromDisplaySize(ev.value) }));
    organisms
      .addBinding(this.state, "birthRadius", {
        label: "Birth radius (%)",
        ...centeredFromMin(this.state.birthRadius, toDisplaySize(MIN_BIRTH_RADIUS)),
        step: 0.05,
      })
      .on("change", (ev) => simulation.setParams({ birthRadius: fromDisplaySize(ev.value) }));
    organisms
      .addBinding(this.state, "burstRadius", {
        label: "Burst radius (%)",
        ...centeredFromMin(this.state.burstRadius, toDisplaySize(MIN_BURST_RADIUS)),
        step: 0.1,
      })
      .on("change", (ev) => simulation.setParams({ burstRadius: fromDisplaySize(ev.value) }));
    organisms
      // Growth rate and burst radius are both shared/deterministic, so a
      // cohort born in the same tick would otherwise grow and burst in
      // perfect lockstep forever. This small random per-organism delay
      // before growth starts is the only source of variation in growth
      // timing — just enough to break that lockstep, not to visibly
      // stagger growth.
      .addBinding(this.state, "growthStartDelayMax", {
        label: "Spawn delay, max (s)",
        ...centeredFromMin(p.growthStartDelayMax, 0),
        step: 0.01,
      })
      .on("change", (ev) => simulation.setParams({ growthStartDelayMax: ev.value }));
    organisms
      .addBinding(this.state, "variationRadius", {
        label: "Variation radius (%)",
        ...centeredFromMin(this.state.variationRadius, 0),
        step: 0.2,
      })
      .on("change", (ev) => simulation.setParams({ variationRadius: fromDisplaySize(ev.value) }));
    organisms
      .addBinding(this.state, "offspringCount", {
        label: "Offspring count (children)",
        ...centeredFromMin(p.offspringCount, 1),
        step: 1,
      })
      .on("change", (ev) => simulation.setParams({ offspringCount: ev.value }));
    organisms
      // 2 guarantees no two fully-grown organisms can ever overlap; lower
      // values relax that (more spawns succeed, more eventual overlap is
      // tolerated); 0 disables the check entirely (always places the child).
      .addBinding(this.state, "spawnClearanceFactor", {
        label: "Spawn clearance (×)",
        min: 0,
        max: 2,
        step: 0.05,
      })
      .on("change", (ev) => simulation.setParams({ spawnClearanceFactor: ev.value }));

    // Population: seeding and overall headcount bookkeeping.
    const population = this.pane.addFolder({ title: "Population", expanded: true });
    population.addBinding(this.state, "seedCount", {
      label: "Seed count (organisms)",
      ...centeredFromMin(this.state.seedCount, 1),
      step: 1,
    });
    population.addButton({ title: "Seed population" }).on("click", () => {
      simulation.seedPopulation(this.state.seedCount);
    });
    population
      .addBinding(this.state, "maxOrganisms", {
        label: "Max population (organisms)",
        ...centeredFromMax(p.maxOrganisms, 1000),
        step: 10,
      })
      .on("change", (ev) => simulation.setParams({ maxOrganisms: ev.value }));
    population.addBinding(this.state, "population", {
      label: "Population (organisms)",
      readonly: true,
      // Organism count is a whole number — the default monitor format shows
      // 2 decimal places, which falsely implies fractional precision.
      format: (v: number) => v.toFixed(0),
    });
    population
      .addBinding(this.state, "autoReseedOnExtinction", { label: "Auto-reseed on extinction" })
      .on("change", (ev) => simulation.setParams({ autoReseedOnExtinction: ev.value }));
  }

  /** Call once per frame (or on a light throttle) to keep the read-only population monitor live. */
  update(): void {
    if (this.state.population !== this.simulation.population) {
      this.state.population = this.simulation.population;
      this.pane.refresh();
    }
  }

  dispose(): void {
    this.pane.dispose();
  }
}
