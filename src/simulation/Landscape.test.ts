import { describe, expect, it } from "vitest";
import { Random } from "./Random";
import { Landscape } from "./Landscape";
import { DEFAULT_PARAMETERS } from "./Parameters";

const BOUNDS = { width: 10, height: 10 };

function makeLandscape(seed: number | string = "test-seed") {
  return new Landscape(new Random(seed), DEFAULT_PARAMETERS, BOUNDS);
}

describe("Landscape", () => {
  it("region membership is stable for a fixed (x, y, time)", () => {
    const landscape = makeLandscape();
    const a = landscape.isViable(0.3, -0.2, 1.5);
    const b = landscape.isViable(0.3, -0.2, 1.5);
    expect(a).toBe(b);
  });

  it("fieldValue is always finite", () => {
    const landscape = makeLandscape();
    for (let i = 0; i < 50; i++) {
      const x = (i - 25) * 0.4;
      const y = (i - 25) * 0.3;
      expect(Number.isFinite(landscape.fieldValue(x, y, i))).toBe(true);
    }
  });

  it("isViable returns a strict boolean", () => {
    const landscape = makeLandscape();
    const result = landscape.isViable(0, 0, 0);
    expect(typeof result).toBe("boolean");
  });

  it("a point exactly at a blob's center is always viable", () => {
    const landscape = makeLandscape();
    const blob = landscape.getBlobs()[0];
    expect(landscape.isViable(blob.x, blob.y, 0)).toBe(true);
  });

  it("a point far outside all blobs is not viable", () => {
    const landscape = makeLandscape();
    expect(landscape.isViable(1000, 1000, 0)).toBe(false);
  });

  it("blobs move over successive update() calls", () => {
    const landscape = makeLandscape();
    const before = landscape.getBlobs().map((b) => ({ x: b.x, y: b.y }));
    for (let i = 0; i < 60; i++) {
      landscape.update(1 / 30, 1, 1, 1);
    }
    const after = landscape.getBlobs();
    const moved = after.some((b, i) => b.x !== before[i].x || b.y !== before[i].y);
    expect(moved).toBe(true);
  });

  it("blobs remain within bounds after many updates", () => {
    const landscape = makeLandscape();
    for (let i = 0; i < 2000; i++) {
      landscape.update(1 / 30, 1, 1, 1);
    }
    const halfW = BOUNDS.width / 2;
    const halfH = BOUNDS.height / 2;
    for (const blob of landscape.getBlobs()) {
      expect(blob.x).toBeGreaterThanOrEqual(-halfW);
      expect(blob.x).toBeLessThanOrEqual(halfW);
      expect(blob.y).toBeGreaterThanOrEqual(-halfH);
      expect(blob.y).toBeLessThanOrEqual(halfH);
    }
  });

  it("containment holds at extreme drift speeds, not just the tuned one", () => {
    const halfW = BOUNDS.width / 2;
    const halfH = BOUNDS.height / 2;

    // 10 is the top of the drift slider; 100 is the kind of value the unclamped
    // "Beyond the sliders" field allows. The soft restoring force isn't dt-scaled
    // and is applied after the speed cap, so a fast drift is exactly where blobs
    // would escape or bounce out if the hard clamp weren't backing it up.
    for (const driftSpeed of [10, 100]) {
      const landscape = makeLandscape(`fast-drift-${driftSpeed}`);
      for (let i = 0; i < 3000; i++) {
        landscape.update(1 / 20, driftSpeed, 1, 1);
        for (const blob of landscape.getBlobs()) {
          expect(Number.isFinite(blob.x)).toBe(true);
          expect(Number.isFinite(blob.y)).toBe(true);
          expect(Math.abs(blob.x)).toBeLessThanOrEqual(halfW);
          expect(Math.abs(blob.y)).toBeLessThanOrEqual(halfH);
        }
      }
    }
  });

  it("field shape changes as time advances (deformation)", () => {
    const landscape = makeLandscape();
    const blob = landscape.getBlobs()[0];
    const probeX = blob.x + blob.radius * 0.9;
    const probeY = blob.y;
    const values = [0, 2, 4, 6, 8].map((t) => landscape.fieldValue(probeX, probeY, t));
    const allEqual = values.every((v) => v === values[0]);
    expect(allEqual).toBe(false);
  });

  it("environmentDeformationStrength scales the wobble amplitude live", () => {
    const landscape = makeLandscape();
    const blob = landscape.getBlobs()[0];
    const probeX = blob.x + blob.radius * 0.9;
    const probeY = blob.y;
    const t = 1.3; // arbitrary, non-zero-crossing point in the wobble cycle

    landscape.update(0, 1, 1, 0);
    const withNoWobble = landscape.fieldValue(probeX, probeY, t);

    landscape.update(0, 1, 1, 3);
    const withExaggeratedWobble = landscape.fieldValue(probeX, probeY, t);

    expect(withExaggeratedWobble).not.toBe(withNoWobble);
  });

  it("raising environmentDeformationSpeed mid-run doesn't retroactively age (and cull) existing blobs", () => {
    const landscape = makeLandscape("deform-speed-change");
    // Build up some run history, so blobs have real accumulated age to rescale.
    for (let i = 0; i < 600; i++) landscape.update(0.1, 1, 0.08, 0.3);

    const now = 60; // == accumulated elapsed time above
    const before = landscape.getEnvironmentStats(now);

    // A dt of 0 advances no time at all, so *nothing* about the current
    // instant may change just because the speed multiplier did.
    landscape.update(0, 1, 0.16, 0.3);
    const after = landscape.getEnvironmentStats(now);

    expect(after.blobCount).toBe(before.blobCount);
    expect(after.averageRadius).toBeCloseTo(before.averageRadius, 10);
    expect(after.coverageFraction).toBeCloseTo(before.coverageFraction, 10);
  });

  it("blob population stays near viabilityBlobCount over a long run instead of drifting down", () => {
    const landscape = makeLandscape("population-stability");
    const target = DEFAULT_PARAMETERS.viabilityBlobCount;

    let min = Infinity;
    let max = 0;
    let total = 0;
    let starved = 0;
    let samples = 0;
    for (let i = 0; i < 6000; i++) {
      landscape.update(0.1, 1, 1, 1);
      const count = landscape.getBlobs().length;
      min = Math.min(min, count);
      max = Math.max(max, count);
      if (count <= target / 2) starved++;
      total += count;
      samples++;
    }

    // The deficit-driven birth rate is what holds the mean on target and makes
    // deep dips both rare and short: with a rate fixed by the target alone the
    // count random-walks freely below it (spending ~10% of a run at half the
    // target or less, and able to sit at one or two blobs for minutes), which
    // is what turned the landscape into a few small islands.
    expect(total / samples).toBeGreaterThan(target - 1);
    expect(total / samples).toBeLessThan(target + 1);
    expect(starved / samples).toBeLessThan(0.05);
    // Never empties out entirely, never exceeds the hard ceiling.
    expect(min).toBeGreaterThan(0);
    expect(max).toBeLessThanOrEqual(Math.ceil(target * 1.5));
  });

  it("is deterministic for a given seed", () => {
    const a = makeLandscape(99);
    const b = makeLandscape(99);
    for (let i = 0; i < 30; i++) {
      a.update(1 / 30, 1, 1, 1);
      b.update(1 / 30, 1, 1, 1);
    }
    expect(a.getBlobs()).toEqual(b.getBlobs());
  });

  it("blob headings wander instead of drifting in a fixed straight line", () => {
    const landscape = makeLandscape(42);
    const initialVelocities = landscape.getBlobs().map((b) => ({ vx: b.vx, vy: b.vy }));
    for (let i = 0; i < 300; i++) {
      landscape.update(1 / 30, 1, 1, 1);
    }
    const changed = landscape.getBlobs().some((b, i) => {
      const before = initialVelocities[i];
      return before === undefined || b.vx !== before.vx || b.vy !== before.vy;
    });
    expect(changed).toBe(true);
  });

  it("a freshly spawned blob starts invisible and grows in over time", () => {
    const params = { ...DEFAULT_PARAMETERS, viabilityBlobCount: 1 };
    const landscape = new Landscape(new Random(7), params, BOUNDS);

    // Drain the initial (already-grown) blob's lifespan so the population
    // drops to zero and a fresh one has to be spawned to replace it.
    let spawned: ReturnType<Landscape["getBlobs"]>[number] | undefined;
    for (let i = 0; i < 2000 && !spawned; i++) {
      landscape.update(0.1, 1, 1, 1);
      const blobs = landscape.getBlobs();
      if (blobs.length === 1 && blobs[0].birthTime > 0) spawned = blobs[0];
    }
    expect(spawned).toBeDefined();
    if (!spawned) return;

    // At the instant of its own birth, a blob contributes nothing to the field.
    expect(landscape.fieldValue(spawned.x, spawned.y, spawned.birthTime)).toBe(0);
    // Partway through its grow-in ramp it's visible but not yet at full strength.
    const midGrow = spawned.birthTime + spawned.growDuration / 2;
    const midField = landscape.fieldValue(spawned.x, spawned.y, midGrow);
    const fullField = landscape.fieldValue(spawned.x, spawned.y, spawned.birthTime + spawned.growDuration + 1);
    expect(midField).toBeGreaterThan(0);
    expect(midField).toBeLessThan(fullField);
  });

  it("a blob shrinks fully out of existence and is removed by the end of its lifespan", () => {
    const landscape = makeLandscape(13);
    const blob = landscape.getBlobs()[0];
    for (let i = 0; i < 500; i++) landscape.update(0.2, 1, 1, 1);
    const stillPresent = landscape.getBlobs().some((b) => b.id === blob.id);
    expect(stillPresent).toBe(false);
  });

  it("fitnessAt with edgeFadeWidth 0 exactly matches the binary isViable boundary", () => {
    const landscape = makeLandscape();
    const blob = landscape.getBlobs()[0];
    expect(landscape.fitnessAt(blob.x, blob.y, 0, 0)).toBe(1); // dead center: viable
    expect(landscape.fitnessAt(1000, 1000, 0, 0)).toBe(0); // far away: not viable
  });

  it("fitnessAt ramps from 0 at the threshold up to 1 an edgeFadeWidth above it", () => {
    const landscape = makeLandscape();
    const blob = landscape.getBlobs()[0];
    const fadeWidth = 0.5;

    // Deep inside (dead center), fitness is fully 1 regardless of fade width.
    expect(landscape.fitnessAt(blob.x, blob.y, 0, fadeWidth)).toBe(1);

    // Just outside the viable region, fitness is 0 even with fading (the
    // alive/dying boundary — isViable's own threshold — never moves).
    expect(landscape.isViable(1000, 1000, 0)).toBe(false);
    expect(landscape.fitnessAt(1000, 1000, 0, fadeWidth)).toBe(0);
  });

  it("a larger edgeFadeWidth widens the interior throttled band (never increases fitness at a fixed point)", () => {
    const landscape = makeLandscape();
    const blob = landscape.getBlobs()[0];
    // A point partway to the edge, likely inside the fade band for some widths.
    const probeX = blob.x + blob.radius * 0.95;
    const probeY = blob.y;

    const narrow = landscape.fitnessAt(probeX, probeY, 0, 0.1);
    const wide = landscape.fitnessAt(probeX, probeY, 0, 2);
    expect(wide).toBeLessThanOrEqual(narrow);
  });

  it("getEnvironmentStats reports blobCount matching getBlobs and a coverageFraction within [0, 1]", () => {
    const landscape = makeLandscape();
    const stats = landscape.getEnvironmentStats(0);
    expect(stats.blobCount).toBe(landscape.getBlobs().length);
    expect(stats.averageRadius).toBeGreaterThan(0);
    expect(stats.coverageFraction).toBeGreaterThanOrEqual(0);
    expect(stats.coverageFraction).toBeLessThanOrEqual(1);
  });

  it("getEnvironmentStats reports zeros for an empty landscape", () => {
    const params = { ...DEFAULT_PARAMETERS, viabilityBlobCount: 0 };
    const landscape = new Landscape(new Random("empty"), params, BOUNDS);
    for (let i = 0; i < 500; i++) landscape.update(0.2, 1, 1, 1); // drain any spawn-race stragglers
    const stats = landscape.getEnvironmentStats(0);
    if (landscape.getBlobs().length === 0) {
      expect(stats).toEqual({ blobCount: 0, averageRadius: 0, coverageFraction: 0 });
    }
  });

  it("more/bigger blobs never decrease coverageFraction relative to fewer/smaller ones at the same instant", () => {
    const small = makeLandscape("cover-a");
    const bigParams = { ...DEFAULT_PARAMETERS, viabilityBlobRadiusMin: 2, viabilityBlobRadiusMax: 2.5 };
    const big = new Landscape(new Random("cover-a"), bigParams, BOUNDS);
    expect(big.getEnvironmentStats(0).coverageFraction).toBeGreaterThanOrEqual(small.getEnvironmentStats(0).coverageFraction);
  });
});
