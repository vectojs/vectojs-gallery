import { describe, expect, test } from "bun:test";
import { filterCreations } from "../src/filter";
import type { Creation } from "../src/registry";

function creation(overrides: Partial<Creation>): Creation {
  return {
    id: "x",
    title: "X",
    description: "",
    tags: [],
    load: () => Promise.reject(new Error("not used in this test")),
    ...overrides,
  };
}

describe("filterCreations", () => {
  const nexus = creation({
    id: "nexus",
    title: "Nexus",
    description: "A WebGPU particle field spelling VectoJS",
    tags: ["WebGPU", "Compute", "particles"],
  });
  const graph = creation({
    id: "graph",
    title: "Knowledge Graph",
    description: "An infinite pan/zoom map",
    tags: ["Graph", "Scale"],
  });
  const all = [nexus, graph];

  test("empty search and no active tags returns everything", () => {
    expect(filterCreations(all, { search: "", activeTags: [] })).toEqual(all);
  });

  test("search matches on title, case-insensitively", () => {
    expect(filterCreations(all, { search: "NEXUS", activeTags: [] })).toEqual([
      nexus,
    ]);
  });

  test("search matches on description", () => {
    expect(
      filterCreations(all, { search: "pan/zoom", activeTags: [] }),
    ).toEqual([graph]);
  });

  test("search matches on tags", () => {
    expect(filterCreations(all, { search: "compute", activeTags: [] })).toEqual(
      [nexus],
    );
  });

  test("active tags combine with AND — an entry must have every active tag", () => {
    expect(
      filterCreations(all, { search: "", activeTags: ["Graph", "Scale"] }),
    ).toEqual([graph]);
    expect(
      filterCreations(all, { search: "", activeTags: ["Graph", "Compute"] }),
    ).toEqual([]);
  });

  test("search and active tags combine with AND", () => {
    expect(
      filterCreations(all, { search: "knowledge", activeTags: ["Compute"] }),
    ).toEqual([]);
  });

  test("no matches returns an empty array, not null/undefined", () => {
    expect(
      filterCreations(all, { search: "zzz-no-match", activeTags: [] }),
    ).toEqual([]);
  });
});
