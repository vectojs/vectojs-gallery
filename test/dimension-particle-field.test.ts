import { describe, expect, test } from "bun:test";
import { buildParticlePositions } from "../src/creations/dimension/particle-field";

describe("buildParticlePositions", () => {
  test("returns count*3 finite floats", () => {
    const arr = buildParticlePositions(500, 10);
    expect(arr).toBeInstanceOf(Float32Array);
    expect(arr.length).toBe(1500);
    expect([...arr].every((n) => Number.isFinite(n))).toBe(true);
  });

  test("every point lies within the given radius", () => {
    const radius = 8;
    const arr = buildParticlePositions(2000, radius);
    for (let i = 0; i < arr.length; i += 3) {
      const d = Math.hypot(arr[i], arr[i + 1], arr[i + 2]);
      expect(d).toBeLessThanOrEqual(radius + 1e-4);
    }
  });

  test("count 0 yields an empty array", () => {
    expect(buildParticlePositions(0, 5).length).toBe(0);
  });
});
