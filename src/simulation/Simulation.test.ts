import { describe, expect, it } from "vitest";
import { Simulation } from "./Simulation";

describe("Simulation", () => {
  it("detects extinction when population reaches zero", () => {
    const sim = new Simulation({ seed: 1, initialOrganisms: 0, autoReseedOnExtinction: false });
    expect(sim.isExtinct).toBe(true);
    sim.seedPopulation(5);
    expect(sim.isExtinct).toBe(false);
  });

  it("auto-reseeds after the extinction delay when enabled", () => {
    const sim = new Simulation({
      seed: 1,
      initialOrganisms: 5,
      autoReseedOnExtinction: true,
      extinctionReseedDelay: 1,
    });
    sim.seedPopulation(0); // start empty; extinct from tick 0
    expect(sim.isExtinct).toBe(true);

    sim.update(0.5);
    expect(sim.isExtinct).toBe(true); // not enough time has passed yet

    sim.update(0.6);
    expect(sim.isExtinct).toBe(false);
    expect(sim.population).toBeGreaterThan(0);
  });

  it("never exceeds maxOrganisms even with many simultaneous bursts", () => {
    const sim = new Simulation({
      seed: 2,
      initialOrganisms: 0,
      maxOrganisms: 5,
      burstRadius: 0.1,
      burstRadiusVariation: 0,
      burstRadiusMutation: 0,
      growthRate: 20,
      growthRateVariation: 0,
      offspringMin: 4,
      offspringMax: 4,
    });
    sim.seedPopulation(3);
    sim.update(1); // all three should burst simultaneously and try to spawn 12 offspring
    expect(sim.population).toBeLessThanOrEqual(5);
  });

  it("is reproducible for a given seed and dt sequence", () => {
    const makeSim = () =>
      new Simulation({ seed: "repro-seed", initialOrganisms: 10, maxOrganisms: 100 });

    const a = makeSim();
    const b = makeSim();
    a.seedPopulation(a.params.initialOrganisms);
    b.seedPopulation(b.params.initialOrganisms);

    const dts = [1 / 30, 1 / 30, 1 / 20, 1 / 30, 1 / 15];
    for (const dt of dts) {
      a.update(dt);
      b.update(dt);
    }

    expect(a.getOrganisms()).toEqual(b.getOrganisms());
    expect(a.time).toBe(b.time);
  });
});
