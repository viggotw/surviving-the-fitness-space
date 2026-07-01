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

  it("is deterministic for a given seed", () => {
    const a = makeLandscape(99);
    const b = makeLandscape(99);
    for (let i = 0; i < 30; i++) {
      a.update(1 / 30, 1, 1, 1);
      b.update(1 / 30, 1, 1, 1);
    }
    expect(a.getBlobs()).toEqual(b.getBlobs());
  });
});
