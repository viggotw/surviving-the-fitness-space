import { describe, expect, it } from "vitest";
import { Random } from "./Random";

describe("Random", () => {
  it("produces an identical sequence for the same seed", () => {
    const a = new Random(42);
    const b = new Random(42);
    const seqA = Array.from({ length: 20 }, () => a.next());
    const seqB = Array.from({ length: 20 }, () => b.next());
    expect(seqA).toEqual(seqB);
  });

  it("produces different sequences for different seeds", () => {
    const a = new Random(1);
    const b = new Random(2);
    const seqA = Array.from({ length: 10 }, () => a.next());
    const seqB = Array.from({ length: 10 }, () => b.next());
    expect(seqA).not.toEqual(seqB);
  });

  it("accepts string seeds deterministically", () => {
    const a = new Random("hello-world");
    const b = new Random("hello-world");
    expect(a.next()).toBe(b.next());
  });

  it("next() stays within [0, 1)", () => {
    const rng = new Random(7);
    for (let i = 0; i < 1000; i++) {
      const v = rng.next();
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });

  it("range() stays within [min, max)", () => {
    const rng = new Random(7);
    for (let i = 0; i < 1000; i++) {
      const v = rng.range(-5, 5);
      expect(v).toBeGreaterThanOrEqual(-5);
      expect(v).toBeLessThan(5);
    }
  });

  it("int() stays within [min, max] inclusive", () => {
    const rng = new Random(7);
    const seen = new Set<number>();
    for (let i = 0; i < 1000; i++) {
      const v = rng.int(1, 3);
      expect(Number.isInteger(v)).toBe(true);
      expect(v).toBeGreaterThanOrEqual(1);
      expect(v).toBeLessThanOrEqual(3);
      seen.add(v);
    }
    expect(seen.has(1)).toBe(true);
    expect(seen.has(3)).toBe(true);
  });

  it("gaussian() is centered near its mean over many samples", () => {
    const rng = new Random(123);
    const samples = Array.from({ length: 5000 }, () => rng.gaussian(10, 2));
    const mean = samples.reduce((a, b) => a + b, 0) / samples.length;
    expect(mean).toBeGreaterThan(9.5);
    expect(mean).toBeLessThan(10.5);
  });
});
