import { describe, expect, test } from "bun:test";
import { CREATIONS } from "../src/registry";

describe("creation registry", () => {
  test("ids are unique and non-empty", () => {
    const ids = CREATIONS.map((c) => c.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const c of CREATIONS) expect(c.id.length).toBeGreaterThan(0);
  });

  test("creations are ordered alphabetically by title", () => {
    const titles = CREATIONS.map((c) => c.title);
    const sorted = [...titles].sort((a, b) => a.localeCompare(b));
    expect(titles).toEqual(sorted);
  });
});
