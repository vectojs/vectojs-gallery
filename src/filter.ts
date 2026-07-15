import type { Creation } from "./registry";

export interface FilterState {
  search: string;
  activeTags: string[];
}

/**
 * Search does live substring matching (case-insensitive) across title,
 * description, and tags; active tag chips combine with AND. Both combine
 * with each other via AND too — narrowing, never widening.
 */
export function filterCreations(creations: Creation[], state: FilterState): Creation[] {
  const needle = state.search.trim().toLowerCase();

  return creations.filter((c) => {
    if (state.activeTags.length > 0) {
      const hasAllActiveTags = state.activeTags.every((tag) => c.tags.includes(tag));
      if (!hasAllActiveTags) return false;
    }

    if (needle.length === 0) return true;

    const haystack = `${c.title} ${c.description} ${c.tags.join(" ")}`.toLowerCase();
    return haystack.includes(needle);
  });
}
