import { describe, expect, it } from "vitest";
import { Random } from "./Random";
import { DEFAULT_PARAMETERS, WORLD_SIZE } from "./Parameters";
import { createOrganism, updateOrganism, isRemovable, type Organism } from "./Organism";

const alwaysViable = () => true;
const neverViable = () => false;

function makeIdGen(start = 1000) {
  let next = start;
  return () => next++;
}

describe("Organism", () => {
  it("grows monotonically over time while inside a viable region", () => {
    const rng = new Random(1);
    const o = createOrganism(1, 0, 0, undefined, DEFAULT_PARAMETERS, rng);
    let lastRadius = o.radius;
    for (let i = 0; i < 5; i++) {
      updateOrganism(o, 0.05, alwaysViable, i * 0.05, DEFAULT_PARAMETERS, rng, makeIdGen());
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
    const traitsDiffer =
      child.growthRate !== o.growthRate ||
      child.variationRadius !== o.variationRadius ||
      child.hue !== o.hue;
    expect(traitsDiffer).toBe(true);

    // mutation should be bounded (not wildly divergent) for reasonable mutation amounts
    expect(Math.abs(child.growthRate - o.growthRate)).toBeLessThan(1);
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
