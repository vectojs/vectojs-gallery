import { Scene, Entity } from "@vectojs/core";
import { CREATIONS, type Creation } from "./registry";
import { APPS } from "./apps";
import { Bed } from "./ui/Bed";
import { Rail } from "./ui/Rail";
import { CaptionPlate } from "./ui/CaptionPlate";
import { Stage } from "./ui/Stage";
import { BackChip } from "./ui/BackChip";
import { keepSceneLive } from "./keep-live";

const RAIL_WIDTH = 280;

const HASH_PREFIX = "#/creation/";

function creationIdFromHash(): string | null {
  const hash = window.location.hash;
  return hash.startsWith(HASH_PREFIX) ? hash.slice(HASH_PREFIX.length) : null;
}

/**
 * An Entity that needs to react to a resize with more than plain
 * `width`/`height` assignment (e.g. a game's own `W`/`H` fields plus
 * position clamping, or a secondary WebGL canvas) can implement this
 * instead. The load/resize paths below check for it and fall back to
 * plain assignment when it's absent.
 */
interface ResizableEntity {
  resizeTo(width: number, height: number): void;
}

function hasResizeTo(entity: Entity): entity is Entity & ResizableEntity {
  return typeof (entity as Partial<ResizableEntity>).resizeTo === "function";
}

function applySize(entity: Entity, width: number, height: number): void {
  if (hasResizeTo(entity)) entity.resizeTo(width, height);
  else {
    entity.width = width;
    entity.height = height;
  }
}

function initGallery(): void {
  const canvas = document.getElementById(
    "gallery-canvas",
  ) as HTMLCanvasElement | null;
  if (!canvas) return;

  // Must stay 2D-only. A `pointBackend: 'webgl'` scene composites its GL canvas
  // into the 2D canvas every frame; with keepSceneLive() forcing continuous
  // renders that round-trip leaks Firefox shmem to an OOM crash in ~30s
  // (Bugzilla 1980552). Nothing here renders through the scene point batch,
  // so keep it off.
  //
  // `maxFPS: 0` = uncapped (native refresh rate) — Stream Reader's debug FPS
  // panel is meant to reflect the user's actual screen refresh rate, which an
  // explicit cap (the engine default is 60) would hide (forge/findings.md
  // 2026-07-19).
  const scene = new Scene(canvas, { maxFPS: 0, maxDPR: 2 });

  let currentEntity: Entity | null = null;
  let currentPlate: CaptionPlate | null = null;
  let currentStage: Stage | null = null;
  let currentBackChip: BackChip | null = null;
  let currentCreation: Creation | null = null;
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
  // Every ported creation before Chat happened to paint an opaque full-bleed
  // background (a game board, a particle field, a 3D scene), which visually
  // hid the Bed's own catalog cards underneath without anyone needing to
  // hide them explicitly. Chat's UI is a transparent Stack of bubbles, which
  // exposed the real gap: the Bed was still mounted (and still hit-testable)
  // the whole time. Explicitly unmount it while a creation is showing.
  let bedMounted = true;

  const rail = new Rail(
    RAIL_WIDTH,
    window.innerHeight,
    CREATIONS,
    APPS,
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
    if (currentBackChip) {
      scene.remove(currentBackChip);
      currentBackChip = null;
    }
    if (currentEntity) {
      currentEntity.destroy();
      scene.remove(currentEntity);
      currentEntity = null;
    }
    if (currentStage) {
      scene.remove(currentStage);
      currentStage = null;
    }
    currentCreation = null;
  };

  /**
   * The engine's GPU point/particle layer is a separate full-window canvas
   * stacked above the 2D canvas, and it does not clip to any entity's box —
   * without this, particles drawn left of the workspace paint over the Rail
   * (see forge/findings.md 2026-07-17). Clip every stacked sibling canvas to
   * the workspace band. Runs on a delay after each creation mount because the
   * GPU canvas is created lazily on first use.
   */
  const clipStackedCanvases = (): void => {
    const host = canvas.parentElement ?? document.body;
    for (const c of host.querySelectorAll("canvas")) {
      if (c === canvas) continue;
      const el = c as HTMLCanvasElement;
      // Clip only the portion that actually overlaps the rail: a creation-
      // owned canvas already positioned at the workspace offset (e.g.
      // Dimension's Three.js canvas) must NOT lose its left edge.
      const overlap = RAIL_WIDTH - el.getBoundingClientRect().left;
      el.style.clipPath = overlap > 0 ? `inset(0 0 0 ${overlap}px)` : "";
    }
  };

  const showCatalog = (): void => {
    teardownCurrent();
    if (!bedMounted) {
      scene.add(bed);
      bedMounted = true;
    }
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
    if (bedMounted) {
      scene.remove(bed);
      bedMounted = false;
    }

    // Dark backdrop behind the creation (see Stage). Added before the creation
    // entity so it always paints behind it; sized to the workspace area right
    // of the rail.
    currentStage = new Stage(
      window.innerWidth - RAIL_WIDTH,
      window.innerHeight,
      creation.stage,
    );
    currentStage.setPosition(RAIL_WIDTH, 0);
    scene.add(currentStage);

    creation
      .load()
      .then(({ default: EntityClass }) => {
        if (seq !== loadSeq) return; // superseded by a later selection
        currentEntity = new EntityClass();
        currentEntity.setPosition(RAIL_WIDTH, 0);
        applySize(
          currentEntity,
          window.innerWidth - RAIL_WIDTH,
          window.innerHeight,
        );
        scene.add(currentEntity);

        currentCreation = creation;
        currentPlate = new CaptionPlate(creation);
        currentPlate.x = RAIL_WIDTH + 16;
        currentPlate.setBottomAnchor(
          window.innerHeight - 16 - (creation.bottomInset ?? 0),
        );
        scene.add(currentPlate);

        currentBackChip = new BackChip(() => navigateTo(null));
        currentBackChip.setPosition(RAIL_WIDTH + 16, 16);
        scene.add(currentBackChip);

        // Lazily-created GPU canvases appear after the entity's first frame.
        clipStackedCanvases();
        setTimeout(clipStackedCanvases, 100);
        setTimeout(clipStackedCanvases, 600);

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

    if (currentStage) {
      currentStage.width = W - RAIL_WIDTH;
      currentStage.height = H;
    }
    if (currentEntity) {
      applySize(currentEntity, W - RAIL_WIDTH, H);
    }
    if (currentPlate) {
      currentPlate.setBottomAnchor(
        H - 16 - (currentCreation?.bottomInset ?? 0),
      );
    }
    clipStackedCanvases();

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

  // Some ported entries animate purely by mutating their own state in
  // update() without ever calling scene.markDirty() themselves, which the
  // core idle-throttle would otherwise starve. Keeping this on
  // unconditionally for every entry (not just the ones that need it) is
  // simplest and costs nothing extra — it's the same effect as
  // `renderMode: 'always'`, just centralized here instead of per-entity.
  keepSceneLive(scene, () => true);
  scene.start();
}

/**
 * Canvas text is measured and rasterized immediately at paint time, so the
 * chrome (Archivo Black display headings, Inter body) must be loaded before the
 * first frame — otherwise the catalog renders in the Arial Black / system
 * fallback and reflows once the webfont arrives. `document.fonts` doesn't fetch
 * a face until something requests it, so we explicitly kick off the two faces we
 * paint, then wait for `ready`. A short timeout guarantees a font-CDN stall can
 * never leave the gallery blank.
 */
function whenFontsReady(): Promise<void> {
  const fonts = document.fonts;
  if (!fonts) return Promise.resolve();
  try {
    void fonts.load('400 16px "Archivo Black"');
    void fonts.load("400 16px Inter");
  } catch {
    // `load()` throws on malformed descriptors only; ignore and fall through.
  }
  return Promise.race([
    fonts.ready.then(() => undefined),
    new Promise<void>((resolve) => setTimeout(resolve, 1500)),
  ]);
}

window.addEventListener("DOMContentLoaded", () => {
  void whenFontsReady().then(initGallery);
});
