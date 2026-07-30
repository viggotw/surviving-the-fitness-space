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
    sim.update(0.05);
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

  it("burstCount counts only organisms that successfully burst, once each, not every organism created", () => {
    const sim = new Simulation({
      seed: 8,
      initialOrganisms: 0,
      birthRadius: 0.01, // well below burstRadius, so a fresh child needs real growth (not just its starting size) to burst
      burstRadius: 0.1,
      growthRate: 20,
      growthStartDelayMax: 0,
      offspringCount: 4,
      spawnClearanceFactor: 0,
    });
    sim.seedPopulation(3);
    expect(sim.burstCount).toBe(0); // created, but hasn't grown/burst yet

    const blob = sim.getLandscape().getBlobs()[0];
    sim.spawnOrganismAt(blob.x, blob.y); // dead center of a blob is always viable
    expect(sim.burstCount).toBe(0);
    const parentIds = new Set(sim.getOrganisms().map((o) => o.id));

    // A small dt (rather than a full second) so growthRate's huge jump lands
    // within one tick without much real time passing — though viability is
    // still a continuous function of time, so a seed spot exactly on the
    // margin can occasionally flip to non-viable in even a tiny dt; derive
    // the expected count from how many parents actually burst rather than
    // assuming all four do.
    sim.update(0.05);
    const burstedParents = sim.getOrganisms().filter((o) => parentIds.has(o.id) && o.state === "bursting").length;
    expect(burstedParents).toBeGreaterThan(0);
    expect(sim.burstCount).toBe(burstedParents);

    // Staying "bursting" for further ticks (fading out) must not double-count
    // the same organism — a zero-length tick changes no organism's state
    // (nothing ages or grows), isolating that property from the fact that,
    // with growthRate this extreme, a *new* real tick would also instantly
    // mature and burst this cohort's own children.
    sim.update(0);
    expect(sim.burstCount).toBe(burstedParents);
  });

  it("deadCount only counts organisms that died from leaving a viable region, not from bursting", () => {
    const sim = new Simulation({ seed: 9, initialOrganisms: 0, deathFadeDuration: 0.1 });
    sim.spawnOrganismAt(1000, 1000); // instantly dying, far outside every blob
    expect(sim.deadCount).toBe(0);
    sim.update(1); // fade completes and it's removed
    expect(sim.population).toBe(0);
    expect(sim.deadCount).toBe(1);
  });

  it("deadCount does not count organisms removed after a successful burst", () => {
    const sim = new Simulation({
      seed: 10,
      initialOrganisms: 0,
      burstRadius: 0.1,
      growthRate: 20,
      growthStartDelayMax: 0,
      burstEffectDuration: 0.1,
      offspringCount: 1,
      spawnClearanceFactor: 0,
    });
    sim.seedPopulation(1);
    sim.update(0.05); // parent bursts (small dt so the environment can't drift it out of viability first)
    sim.update(0.2); // burst-effect fade completes, parent removed
    expect(sim.deadCount).toBe(0);
  });

  it("runTime advances while alive, freezes at extinction, and restarts on the next spawn", () => {
    const sim = new Simulation({ seed: 11, initialOrganisms: 0, deathFadeDuration: 0.1 });
    sim.spawnOrganismAt(1000, 1000); // dying immediately, far outside every blob
    expect(sim.runTime).toBe(0);

    sim.update(0.05);
    expect(sim.runTime).toBeCloseTo(0.05, 10);

    sim.update(1); // fade completes; population goes to zero
    expect(sim.isExtinct).toBe(true);
    const frozenAt = sim.runTime;

    sim.update(1); // no organisms — runTime must stay frozen
    expect(sim.runTime).toBe(frozenAt);

    sim.spawnOrganismAt(0, 0); // new run begins
    expect(sim.runTime).toBe(0);
  });

  it("burstCount and deadCount reset together with runTime on the next spawn after extinction", () => {
    const sim = new Simulation({
      seed: 13,
      initialOrganisms: 0,
      birthRadius: 0.01,
      burstRadius: 0.1,
      growthRate: 20,
      growthStartDelayMax: 0,
      deathFadeDuration: 0.1,
      spawnClearanceFactor: 0,
    });
    const blob = sim.getLandscape().getBlobs()[0];
    sim.spawnOrganismAt(blob.x, blob.y);
    sim.update(0.05); // bursts
    expect(sim.burstCount).toBeGreaterThan(0);

    sim.spawnOrganismAt(1000, 1000); // a second, doomed organism, far outside every blob
    sim.update(1); // it dies and fades
    expect(sim.deadCount).toBeGreaterThan(0);

    sim.killAll(); // clears whatever is left (offspring from the burst above)
    sim.update(1); // fade completes; population goes to zero
    expect(sim.isExtinct).toBe(true);
    expect(sim.burstCount).toBeGreaterThan(0); // not reset yet — still extinct
    expect(sim.deadCount).toBeGreaterThan(0);

    sim.spawnOrganismAt(blob.x, blob.y); // new run begins
    expect(sim.burstCount).toBe(0);
    expect(sim.deadCount).toBe(0);
    expect(sim.runTime).toBe(0);
  });

  it("killAll marks every organism dying so they fade away and count toward deadCount", () => {
    const sim = new Simulation({ seed: 12, initialOrganisms: 0, deathFadeDuration: 0.1 });
    const blob = sim.getLandscape().getBlobs()[0];
    sim.spawnOrganismAt(blob.x, blob.y);
    sim.spawnOrganismAt(blob.x, blob.y);
    expect(sim.population).toBe(2);

    sim.killAll();
    for (const o of sim.getOrganisms()) expect(o.state).toBe("dying");

    sim.update(1); // fade completes
    expect(sim.population).toBe(0);
    expect(sim.deadCount).toBe(2);
  });

  it("burstsThisTick/fallsThisTick reflect only the most recent tick's events, for sound effects", () => {
    const sim = new Simulation({
      seed: 14,
      initialOrganisms: 0,
      birthRadius: 0.01,
      burstRadius: 0.1,
      growthRate: 20,
      growthStartDelayMax: 0,
      spawnClearanceFactor: 0,
    });
    expect(sim.burstsThisTick).toBe(0);
    expect(sim.fallsThisTick).toBe(0);

    const blob = sim.getLandscape().getBlobs()[0];
    sim.spawnOrganismAt(blob.x, blob.y); // will burst

    // A point *within* world bounds but outside every blob: createOrganism
    // only rejects out-of-bounds positions at creation, so this organism
    // starts "alive" and only transitions to "dying" once isViable() fails
    // on its first tick — the actual alive → dying path fallsThisTick
    // tracks (unlike a click far outside the world entirely, which is
    // already "dying" the instant it's created, never having been "alive").
    let fallX = 5;
    let fallY = 5;
    while (sim.getLandscape().isViable(fallX, fallY, 0)) fallY -= 0.1;
    sim.spawnOrganismAt(fallX, fallY);

    sim.update(0.05);
    expect(sim.burstsThisTick).toBe(1);
    expect(sim.fallsThisTick).toBe(1);

    // Neither original organism transitions again (one is now "bursting",
    // the other "dying") — the counts must not carry over or double-count.
    // A zero-length tick changes no organism's state, isolating that
    // property from the fact that a *real* tick would also cause this
    // burst's own children (birthRadius well under burstRadius, but
    // growthRate this extreme) to instantly mature and burst themselves.
    sim.update(0);
    expect(sim.burstsThisTick).toBe(0);
    expect(sim.fallsThisTick).toBe(0);
  });

  it("burstsThisTick/fallsThisTick reset even on a paused tick, rather than leaking the previous tick's counts", () => {
    const sim = new Simulation({
      seed: 15,
      initialOrganisms: 0,
      birthRadius: 0.01,
      burstRadius: 0.1,
      growthRate: 20,
      growthStartDelayMax: 0,
      spawnClearanceFactor: 0,
    });
    const blob = sim.getLandscape().getBlobs()[0];
    sim.spawnOrganismAt(blob.x, blob.y);
    sim.update(0.05);
    expect(sim.burstsThisTick).toBe(1);

    sim.paused = true;
    sim.update(0.05);
    expect(sim.burstsThisTick).toBe(0);
  });
});
