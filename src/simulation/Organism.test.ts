import { describe, expect, it } from "vitest";
import { Random } from "./Random";
import { DEFAULT_PARAMETERS, WORLD_SIZE } from "./Parameters";
import { createOrganism, mutate, updateOrganism, isRemovable, type Organism } from "./Organism";

const alwaysViable = () => true;
const neverViable = () => false;

function makeIdGen(start = 1000) {
  let next = start;
  return () => next++;
}

describe("Organism", () => {
  it("grows monotonically over time while inside a viable region", () => {
    const rng = new Random(1);
    const params = { ...DEFAULT_PARAMETERS, growthStartDelayMax: 0 };
    const o = createOrganism(1, 0, 0, undefined, params, rng);
    let lastRadius = o.radius;
    for (let i = 0; i < 5; i++) {
      updateOrganism(o, 0.05, alwaysViable, i * 0.05, params, rng, makeIdGen());
      expect(o.radius).toBeGreaterThan(lastRadius);
      lastRadius = o.radius;
    }
  });

  it("transitions to 'bursting' once radius reaches burstRadius", () => {
    const rng = new Random(2);
    const params = { ...DEFAULT_PARAMETERS, burstRadius: 0.2, growthRate: 1 };
    const o = createOrganism(1, 0, 0, undefined, params, rng);
    expect(o.state).toBe("alive");
    updateOrganism(o, 1, alwaysViable, 0, params, rng, makeIdGen());
    expect(o.state).toBe("bursting");
  });

  it("spawns exactly offspringCount children within variationRadius of the parent on burst", () => {
    const rng = new Random(3);
    const params = { ...DEFAULT_PARAMETERS, burstRadius: 0.2, growthRate: 1, variationRadius: 0.4, offspringCount: 5 };
    const o = createOrganism(1, 0.5, -0.5, undefined, params, rng);
    const offspring = updateOrganism(o, 1, alwaysViable, 0, params, rng, makeIdGen());
    expect(offspring.length).toBe(params.offspringCount);
    for (const child of offspring) {
      const dist = Math.hypot(child.x - o.x, child.y - o.y);
      expect(dist).toBeLessThanOrEqual(o.variationRadius + 1e-9);
      expect(child.parentId).toBe(o.id);
    }
  });

  it("offspring inherit mutated traits, not identical copies", () => {
    const rng = new Random(4);
    const params = { ...DEFAULT_PARAMETERS, burstRadius: 0.2, growthRate: 1 };
    const o = createOrganism(1, 0, 0, undefined, params, rng);
    const offspring = updateOrganism(o, 1, alwaysViable, 0, params, rng, makeIdGen());
    expect(offspring.length).toBeGreaterThan(0);
    const child = offspring[0];
    const traitsDiffer = child.variationRadius !== o.variationRadius || child.hue !== o.hue;
    expect(traitsDiffer).toBe(true);

    // mutation should be bounded (not wildly divergent) for reasonable mutation amounts
    expect(Math.abs(child.variationRadius - o.variationRadius)).toBeLessThan(1);
  });

  it("mutate() never piles up on a shared floor value across many generations", () => {
    // A hard Math.max(min, ...) clamp maps every undershoot to the
    // identical floor value, and repeated generations pile up an
    // ever-growing spike there. The reflecting floor must never produce
    // that kind of exact duplicate.
    const rng = new Random(11);
    let pop = new Array(200).fill(0.22);
    for (let gen = 0; gen < 15; gen++) {
      pop = pop.map((v) => mutate(v, DEFAULT_PARAMETERS.variationRadiusMutation, rng, 0));
      expect(new Set(pop).size).toBe(pop.length);
    }
  });

  it("growthRate and burstRadius are shared and deterministic, not per-organism", () => {
    // Two organisms with different rng draws and different spawnDelay must
    // still take exactly the same amount of *growing* time to reach burst,
    // since growth rate and burst radius are both read live from params,
    // not stored/mutated per organism.
    const rng = new Random(12);
    const params = { ...DEFAULT_PARAMETERS, growthRate: 0.05, burstRadius: 0.2, growthStartDelayMax: 0 };
    const a = createOrganism(1, 0, 0, undefined, params, rng);
    const b = createOrganism(2, 0, 0, undefined, params, rng);
    expect(a).not.toHaveProperty("growthRate");
    for (let i = 0; i < 10; i++) {
      updateOrganism(a, 0.3, alwaysViable, i * 0.3, params, rng, makeIdGen());
      updateOrganism(b, 0.3, alwaysViable, i * 0.3, params, rng, makeIdGen());
      expect(a.radius).toBeCloseTo(b.radius, 10);
    }
  });

  it("holds at birth radius until spawnDelay elapses, then grows deterministically", () => {
    const rng = new Random(13);
    const params = { ...DEFAULT_PARAMETERS, growthRate: 1, growthStartDelayMax: 1 };
    const o = createOrganism(1, 0, 0, undefined, params, rng);
    o.spawnDelay = 0.5; // force a known delay for a deterministic assertion
    const birthRadius = o.radius;

    updateOrganism(o, 0.2, alwaysViable, 0.2, params, rng, makeIdGen());
    expect(o.radius).toBe(birthRadius); // still within the delay window

    updateOrganism(o, 0.2, alwaysViable, 0.4, params, rng, makeIdGen());
    expect(o.radius).toBe(birthRadius); // still within the delay window (age 0.4 < 0.5)

    updateOrganism(o, 0.2, alwaysViable, 0.6, params, rng, makeIdGen());
    expect(o.radius).toBeGreaterThan(birthRadius); // delay elapsed partway through this tick
  });

  it("two organisms whose spawnDelay falls in the same tick still end up with distinct radii", () => {
    // Ticks are a coarse, shared dt grid. If growth only checked
    // `age >= spawnDelay` and then applied the *full* dt's worth of
    // growth, every organism whose distinct, continuous spawnDelay landed
    // within the same tick window would start growing on the same tick and
    // produce bit-for-bit identical radii forever after — quantizing away
    // the delay's whole purpose and reproducing the sync/"blinking" bug.
    const rng = new Random(14);
    const params = { ...DEFAULT_PARAMETERS, growthRate: 1 };
    const a = createOrganism(1, 0, 0, undefined, params, rng);
    const b = createOrganism(2, 0, 0, undefined, params, rng);
    a.spawnDelay = 0.31; // both fall inside the same [0.3, 0.35) tick window
    b.spawnDelay = 0.33;

    const dt = 0.05;
    for (let i = 0; i < 20; i++) {
      updateOrganism(a, dt, alwaysViable, i * dt, params, rng, makeIdGen());
      updateOrganism(b, dt, alwaysViable, i * dt, params, rng, makeIdGen());
    }
    expect(a.radius).not.toBe(b.radius);
  });

  it("bursts at exactly the predefined burstRadius, not a per-organism value", () => {
    const rng = new Random(8);
    const params = { ...DEFAULT_PARAMETERS, burstRadius: 0.2, growthRate: 1 };
    const a = createOrganism(1, 0, 0, undefined, params, rng);
    const b = createOrganism(2, 0, 0, a, params, rng);
    updateOrganism(a, 1, alwaysViable, 0, params, rng, makeIdGen());
    updateOrganism(b, 1, alwaysViable, 0, params, rng, makeIdGen());
    expect(a.state).toBe("bursting");
    expect(b.state).toBe("bursting");

    // Lowering the live parameter mid-run immediately changes the threshold for everyone.
    const lowered = { ...params, burstRadius: 0.01 };
    const c = createOrganism(3, 0, 0, undefined, lowered, rng);
    updateOrganism(c, 0.02, alwaysViable, 0, lowered, rng, makeIdGen());
    expect(c.state).toBe("bursting");
  });

  it("becomes 'dying' when it leaves the viable region", () => {
    const rng = new Random(5);
    const o = createOrganism(1, 0, 0, undefined, DEFAULT_PARAMETERS, rng);
    updateOrganism(o, 0.1, neverViable, 0, DEFAULT_PARAMETERS, rng, makeIdGen());
    expect(o.state).toBe("dying");
  });

  it("stays 'alive' while inside a viable region", () => {
    const rng = new Random(6);
    const params = { ...DEFAULT_PARAMETERS, burstRadius: 100 };
    const o = createOrganism(1, 0, 0, undefined, params, rng);
    updateOrganism(o, 0.1, alwaysViable, 0, params, rng, makeIdGen());
    expect(o.state).toBe("alive");
  });

  it("offspring born outside the world bounds are immediately 'dying'", () => {
    const rng = new Random(9);
    const params = {
      ...DEFAULT_PARAMETERS,
      burstRadius: 0.2,
      growthRate: 1,
      variationRadius: 0.1,
      offspringCount: 1,
    };
    const o = createOrganism(1, WORLD_SIZE + 1, WORLD_SIZE + 1, undefined, params, rng);
    expect(o.state).toBe("dying");

    const parentAtEdge = createOrganism(2, WORLD_SIZE - 0.01, 0, undefined, params, rng);
    const offspring = updateOrganism(parentAtEdge, 1, alwaysViable, 0, params, rng, makeIdGen());
    expect(offspring.length).toBe(1);
    for (const child of offspring) {
      if (child.x > WORLD_SIZE || child.x < -WORLD_SIZE || child.y > WORLD_SIZE || child.y < -WORLD_SIZE) {
        expect(child.state).toBe("dying");
      } else {
        expect(child.state).toBe("alive");
      }
    }
  });

  it("isRemovable becomes true once a dying organism's opacity reaches zero", () => {
    const rng = new Random(7);
    const params = { ...DEFAULT_PARAMETERS, deathFadeDuration: 0.2 };
    const o: Organism = createOrganism(1, 0, 0, undefined, params, rng);
    updateOrganism(o, 0.1, neverViable, 0, params, rng, makeIdGen());
    expect(isRemovable(o)).toBe(false);
    for (let i = 0; i < 10; i++) {
      updateOrganism(o, 0.1, neverViable, i * 0.1, params, rng, makeIdGen());
    }
    expect(isRemovable(o)).toBe(true);
  });
});
