import { Scene, Entity } from "@vectojs/core";
import { CREATIONS, type Creation } from "./registry";
import { Bed } from "./ui/Bed";
import { Rail } from "./ui/Rail";
import { CaptionPlate } from "./ui/CaptionPlate";

const RAIL_WIDTH = 280;

const HASH_PREFIX = "#/creation/";

function creationIdFromHash(): string | null {
  const hash = window.location.hash;
  return hash.startsWith(HASH_PREFIX) ? hash.slice(HASH_PREFIX.length) : null;
}

function initGallery(): void {
  const canvas = document.getElementById(
    "gallery-canvas",
  ) as HTMLCanvasElement | null;
  if (!canvas) return;

  const scene = new Scene(canvas, { maxFPS: 60 });

  let currentEntity: Entity | null = null;
  let currentPlate: CaptionPlate | null = null;
  let loadSeq = 0;
  // `undefined` (not `null`) so the very first call to loadCreation(null) —
  // the fresh-page-load, no-hash case — never short-circuits against this
  // sentinel; `null` is a legitimate `id` value (the catalog view itself),
  // so it can't double as "nothing has loaded yet".
  let activeId: string | null | undefined = undefined;

  const bed = new Bed(
    window.innerWidth - RAIL_WIDTH,
    window.innerHeight,
    (creation) => navigateTo(creation),
  );
  scene.add(bed);

  const rail = new Rail(
    RAIL_WIDTH,
    window.innerHeight,
    CREATIONS,
    (creation) => navigateTo(creation),
    (filtered) => bed.setCreations(filtered),
  );
  rail.setPosition(0, 0);
  scene.add(rail);
  bed.setPosition(RAIL_WIDTH, 0);

  // Disposes whatever entry is currently mounted before it's removed —
  // entries that own extra resources (e.g. a secondary WebGL canvas)
  // override `destroy()` to release them; `Entity.destroy()` itself only
  // clears animations/drivers/listeners, so this is a no-op for entries
  // that don't override it.
  const teardownCurrent = (): void => {
    if (currentPlate) {
      scene.remove(currentPlate);
      currentPlate = null;
    }
    if (currentEntity) {
      currentEntity.destroy();
      scene.remove(currentEntity);
      currentEntity = null;
    }
  };

  const showCatalog = (): void => {
    teardownCurrent();
    bed.setCreations(CREATIONS);
    scene.markDirty();
  };

  const loadCreation = (creation: Creation | null): void => {
    const id = creation?.id ?? null;
    if (id === activeId) return;
    activeId = id;

    const seq = ++loadSeq;

    if (!creation) {
      showCatalog();
      return;
    }

    teardownCurrent();

    creation
      .load()
      .then(({ default: EntityClass }) => {
        if (seq !== loadSeq) return; // superseded by a later selection
        currentEntity = new EntityClass();
        currentEntity.width = window.innerWidth - RAIL_WIDTH;
        currentEntity.height = window.innerHeight;
        currentEntity.setPosition(RAIL_WIDTH, 0);
        scene.add(currentEntity);

        currentPlate = new CaptionPlate(creation);
        currentPlate.setPosition(
          RAIL_WIDTH + 16,
          window.innerHeight - currentPlate.height - 16,
        );
        scene.add(currentPlate);

        scene.markDirty();
      })
      .catch((err: unknown) => {
        if (seq !== loadSeq) return;
        console.error(`Failed to load creation "${creation.id}":`, err);
      });
  };

  const setHash = (id: string | null): void => {
    const next = id ? `${HASH_PREFIX}${id}` : "";
    if (window.location.hash !== next) {
      if (next) window.location.hash = next;
      else
        history.replaceState(
          null,
          "",
          window.location.pathname + window.location.search,
        );
    }
  };

  const navigateTo = (creation: Creation | null): void => {
    loadCreation(creation);
    setHash(creation?.id ?? null);
  };

  const resize = (): void => {
    const W = window.innerWidth;
    const H = window.innerHeight;
    scene.resize(W, H);

    rail.height = H;
    bed.resize(W - RAIL_WIDTH, H, CREATIONS);

    if (currentEntity) {
      currentEntity.width = W - RAIL_WIDTH;
      currentEntity.height = H;
    }
    if (currentPlate) {
      currentPlate.setPosition(RAIL_WIDTH + 16, H - currentPlate.height - 16);
    }

    scene.markDirty();
  };

  window.addEventListener("resize", resize);

  window.addEventListener("hashchange", () => {
    const id = creationIdFromHash();
    const match = id ? (CREATIONS.find((c) => c.id === id) ?? null) : null;
    loadCreation(match);
  });

  resize();
  const initialId = creationIdFromHash();
  const initialCreation = initialId
    ? (CREATIONS.find((c) => c.id === initialId) ?? null)
    : null;
  loadCreation(initialCreation);

  scene.start();
}

window.addEventListener("DOMContentLoaded", initGallery);
