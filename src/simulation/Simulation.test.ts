import { describe, expect, it } from "vitest";
import { Simulation } from "./Simulation";
import { WORLD_SIZE } from "./Parameters";

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
      growthRate: 20,
      offspringCount: 4,
    });
    sim.seedPopulation(3);
    sim.update(1); // all three should burst simultaneously and try to spawn 12 offspring
    expect(sim.population).toBeLessThanOrEqual(5);
  });

  it("removes the oldest organisms to make room rather than truncating a burst's offspring", () => {
    const sim = new Simulation({
      seed: 3,
      initialOrganisms: 0,
      maxOrganisms: 4,
      burstRadius: 0.1,
      growthRate: 20,
      offspringCount: 4,
    });
    sim.seedPopulation(1); // a single parent, about to burst
    sim.update(1); // parent bursts, requesting its full brood of 4 offspring

    // the cap (4) is hit only because the aging parent is displaced, not because
    // any of the newly spawned offspring were dropped
    expect(sim.population).toBe(4);
    for (const o of sim.getOrganisms()) {
      expect(o.parentId).toBeDefined();
      expect(o.state).toBe("alive");
    }
  });

  it("spawnOrganismAt adds a growing organism inside a viable region", () => {
    const sim = new Simulation({ seed: 4, initialOrganisms: 0 });
    const blob = sim.getLandscape().getBlobs()[0];
    sim.spawnOrganismAt(blob.x, blob.y); // dead center of a blob is always viable
    expect(sim.population).toBe(1);

    const before = sim.getOrganisms()[0].radius;
    sim.update(1);
    expect(sim.population).toBe(1);
    expect(sim.getOrganisms()[0].state).toBe("alive");
    expect(sim.getOrganisms()[0].radius).toBeGreaterThan(before);
  });

  it("spawnOrganismAt in a non-viable spot falls away instead of growing", () => {
    const sim = new Simulation({ seed: 5, initialOrganisms: 0 });
    sim.spawnOrganismAt(1000, 1000); // far outside every blob
    expect(sim.population).toBe(1);
    sim.update(0.1);
    expect(sim.getOrganisms()[0].state).toBe("dying");
  });

  it("spawnOrganismAt outside world bounds is immediately dying, same as any other out-of-bounds spawn", () => {
    const sim = new Simulation({ seed: 6, initialOrganisms: 0 });
    sim.spawnOrganismAt(WORLD_SIZE + 5, 0);
    expect(sim.getOrganisms()[0].state).toBe("dying");
  });

  it("spawnOrganismAt displaces the oldest organism instead of exceeding maxOrganisms", () => {
    const sim = new Simulation({ seed: 7, initialOrganisms: 0, maxOrganisms: 3 });
    sim.seedPopulation(3);
    expect(sim.population).toBe(3);
    const survivingIds = sim.getOrganisms().slice(1).map((o) => o.id);

    sim.spawnOrganismAt(0, 0);
    expect(sim.population).toBe(3);
    const ids = sim.getOrganisms().map((o) => o.id);
    for (const id of survivingIds) expect(ids).toContain(id);
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
