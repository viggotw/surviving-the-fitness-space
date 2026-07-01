import { Pane } from "tweakpane";
import type { Simulation } from "../simulation/Simulation";

interface ControlsState {
  playing: boolean;
  seedCount: number;
  environmentDriftSpeed: number;
  environmentDeformationSpeed: number;
  environmentDeformationStrength: number;
  variationRadius: number;
  growthRate: number;
  burstRadius: number;
  offspringCount: number;
  maxOrganisms: number;
  population: number;
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
    this.pane = new Pane({ container, title: "Controls" });
    const p = simulation.params;

    this.state = {
      playing: !simulation.paused,
      seedCount: p.initialOrganisms,
      environmentDriftSpeed: p.environmentDriftSpeed,
      environmentDeformationSpeed: p.environmentDeformationSpeed,
      environmentDeformationStrength: p.environmentDeformationStrength,
      variationRadius: p.variationRadius,
      growthRate: p.growthRate,
      burstRadius: p.burstRadius,
      offspringCount: p.offspringCount,
      maxOrganisms: p.maxOrganisms,
      population: simulation.population,
    };

    // Global transport controls.
    this.pane
      .addBinding(this.state, "playing", { label: "Play / Pause" })
      .on("change", (ev) => {
        simulation.paused = !ev.value;
      });
    this.pane.addButton({ title: "Reset" }).on("click", () => onReset());

    // Environment: governs the moving/deforming viable regions (the "lava-lamp" pattern).
    const environment = this.pane.addFolder({ title: "Environment", expanded: true });
    environment
      .addBinding(this.state, "environmentDriftSpeed", { label: "Drift speed (×)", min: 0, max: 2, step: 0.01 })
      .on("change", (ev) => simulation.setParams({ environmentDriftSpeed: ev.value }));
    environment
      .addBinding(this.state, "environmentDeformationSpeed", { label: "Deform speed (×)", min: 0, max: 2, step: 0.01 })
      .on("change", (ev) => simulation.setParams({ environmentDeformationSpeed: ev.value }));
    environment
      .addBinding(this.state, "environmentDeformationStrength", { label: "Deform strength (×)", min: 0, max: 3, step: 0.01 })
      .on("change", (ev) => simulation.setParams({ environmentDeformationStrength: ev.value }));

    // Organisms: governs individual growth, reproduction, and heritable variation.
    const organisms = this.pane.addFolder({ title: "Organisms", expanded: true });
    organisms
      .addBinding(this.state, "growthRate", {
        label: "Growth rate (units/s)",
        min: 0.0005,
        max: 0.03,
        step: 0.0005,
      })
      .on("change", (ev) => simulation.setParams({ growthRate: ev.value }));
    organisms
      .addBinding(this.state, "burstRadius", { label: "Burst radius (units)", min: 0.01, max: 0.3, step: 0.005 })
      .on("change", (ev) => simulation.setParams({ burstRadius: ev.value }));
    organisms
      .addBinding(this.state, "variationRadius", { label: "Variation radius (units)", min: 0, max: 0.6, step: 0.01 })
      .on("change", (ev) => simulation.setParams({ variationRadius: ev.value }));
    organisms
      .addBinding(this.state, "offspringCount", { label: "Offspring count (children)", min: 1, max: 10, step: 1 })
      .on("change", (ev) => simulation.setParams({ offspringCount: ev.value }));

    // Population: seeding and overall headcount bookkeeping.
    const population = this.pane.addFolder({ title: "Population", expanded: true });
    population.addBinding(this.state, "seedCount", { label: "Seed count (organisms)", min: 1, max: 200, step: 1 });
    population.addButton({ title: "Seed population" }).on("click", () => {
      simulation.seedPopulation(this.state.seedCount);
    });
    population
      .addBinding(this.state, "maxOrganisms", { label: "Max population (organisms)", min: 10, max: 1000, step: 10 })
      .on("change", (ev) => simulation.setParams({ maxOrganisms: ev.value }));
    population.addBinding(this.state, "population", { label: "Population (organisms)", readonly: true });
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
