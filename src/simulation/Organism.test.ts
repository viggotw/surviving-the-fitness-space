import { describe, expect, it } from "vitest";
import { Random } from "./Random";
import { DEFAULT_PARAMETERS } from "./Parameters";
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

  it("spawns offspring within variationRadius of the parent on burst", () => {
    const rng = new Random(3);
    const params = { ...DEFAULT_PARAMETERS, burstRadius: 0.2, growthRate: 1, variationRadius: 0.4 };
    const o = createOrganism(1, 0.5, -0.5, undefined, params, rng);
    const offspring = updateOrganism(o, 1, alwaysViable, 0, params, rng, makeIdGen());
    expect(offspring.length).toBeGreaterThanOrEqual(params.offspringMin);
    expect(offspring.length).toBeLessThanOrEqual(params.offspringMax);
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
      child.burstRadius !== o.burstRadius ||
      child.variationRadius !== o.variationRadius ||
      child.hue !== o.hue;
    expect(traitsDiffer).toBe(true);

    // mutation should be bounded (not wildly divergent) for reasonable mutation amounts
    expect(Math.abs(child.growthRate - o.growthRate)).toBeLessThan(1);
    expect(Math.abs(child.burstRadius - o.burstRadius)).toBeLessThan(1);
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
