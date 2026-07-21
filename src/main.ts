import { Scene, Entity } from "@vectojs/core";
import { CREATIONS, type Creation } from "./registry";
import { APPS } from "./apps";
import { Bed } from "./ui/Bed";
import { Rail, COLLAPSED_RAIL_WIDTH } from "./ui/Rail";
import { CaptionPlate } from "./ui/CaptionPlate";
import { Stage } from "./ui/Stage";
import { BackChip } from "./ui/BackChip";
import { FullscreenChip } from "./ui/FullscreenChip";
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
  //
  // `a11ySyncInterval: 100` throttles the accessibility/content-projection
  // DOM mirror sync, which otherwise walks the ENTIRE entity tree every
  // qualifying frame (default interval is 0 = unthrottled) once anything is
  // interactive/selectable or content projection is enabled — for a large
  // streamed Markdown document (thousands of mounted paragraphs) this walk
  // itself became a dominant per-frame cost, independent of and on top of
  // every other streaming fix (see forge/findings.md 2026-07-19). A 100ms
  // staleness bound for the DOM mirror (used for native text selection,
  // screen readers, and automation) is imperceptible to users while cutting
  // this walk's frequency by roughly two orders of magnitude at 60fps.
  const scene = new Scene(canvas, {
    maxFPS: 0,
    maxDPR: 2,
    a11ySyncInterval: 100,
  });

  let currentEntity: Entity | null = null;
  let currentPlate: CaptionPlate | null = null;
  let currentStage: Stage | null = null;
  let currentBackChip: BackChip | null = null;
  let currentFullscreenChip: FullscreenChip | null = null;
  let currentCreation: Creation | null = null;
  let fullscreen = false;
  // Catalog-view rail collapse (independent of a creation's fullscreen): the
  // rail shrinks to a thin brand strip so the cards get the width back.
  let railCollapsed = false;
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
    (collapsed) => setRailCollapsed(collapsed),
  );
  rail.setPosition(0, 0);
  scene.add(rail);

  // Disposes whatever entry is currently mounted before it's removed —
  // entries that own extra resources (e.g. a secondary WebGL canvas)
  // override `destroy()` to release them; `Entity.destroy()` itself only
  // clears animations/drivers/listeners, so this is a no-op for entries
  // that don't override it.
  // Workspace origin/width depend on whether the rail is hidden (a creation's
  // fullscreen) or collapsed to its thin brand strip (catalog-view toggle).
  const railWidth = (): number =>
    fullscreen ? 0 : railCollapsed ? COLLAPSED_RAIL_WIDTH : RAIL_WIDTH;
  const workspaceX = (): number => railWidth();
  const workspaceW = (): number => window.innerWidth - railWidth();

  const teardownCurrent = (): void => {
    if (currentPlate) {
      scene.remove(currentPlate);
      currentPlate = null;
    }
    if (currentBackChip) {
      scene.remove(currentBackChip);
      currentBackChip = null;
    }
    if (currentFullscreenChip) {
      scene.remove(currentFullscreenChip);
      currentFullscreenChip = null;
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
    // Restore the default every creation but `chat` relies on (see the
    // `renderMode = 'onDemand'` assignment in `loadCreation` below) before
    // whatever mounts next gets a chance to run.
    scene.renderMode = "always";
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
      const overlap = railWidth() - el.getBoundingClientRect().left;
      el.style.clipPath = overlap > 0 ? `inset(0 0 0 ${overlap}px)` : "";
    }
  };

  // Positions + sizes the catalog Bed to the current workspace band (right of
  // whatever width the rail currently occupies).
  const layoutBed = (): void => {
    bed.setPosition(railWidth(), 0);
    bed.resize(workspaceW(), window.innerHeight, CREATIONS);
  };
  layoutBed();

  const showCatalog = (): void => {
    teardownCurrent();
    // Leaving a creation always restores the rail-visible catalog layout.
    if (fullscreen) {
      fullscreen = false;
      scene.add(rail);
    }
    if (!bedMounted) {
      scene.add(bed);
      bedMounted = true;
    }
    layoutBed();
    scene.markDirty();
  };

  // Catalog-view rail collapse toggle. Reflows the Bed (catalog) or the mounted
  // creation + its chrome (creation view) into the widened workspace.
  const setRailCollapsed = (collapsed: boolean): void => {
    if (railCollapsed === collapsed) return;
    railCollapsed = collapsed;
    if (bedMounted) {
      layoutBed();
    } else {
      layoutWorkspaceEntity();
    }
    clipStackedCanvases();
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
    currentStage = new Stage(workspaceW(), window.innerHeight, creation.stage);
    currentStage.setPosition(workspaceX(), 0);
    scene.add(currentStage);

    creation
      .load()
      .then(({ default: EntityClass }) => {
        if (seq !== loadSeq) return; // superseded by a later selection
        currentEntity = new EntityClass();
        currentEntity.setPosition(workspaceX(), 0);
        applySize(currentEntity, workspaceW(), window.innerHeight);
        scene.add(currentEntity);

        currentCreation = creation;
        // `onDemand` skips the entire update/render walk while idle (no
        // dirty flag, no in-flight animation) — unlike the `maxFPS`-gated
        // 2fps auto-throttle, it doesn't depend on a capped `maxFPS`, so it
        // works together with the uncapped FPS display. Only safe for a
        // creation that already calls `scene.markDirty()` at every point
        // its own visuals change (`continuousRedraw: false`); every other
        // creation keeps the default `always` mode set in `teardownCurrent`.
        // See forge/findings.md 2026-07-19.
        scene.renderMode =
          creation.continuousRedraw === false ? "onDemand" : "always";
        currentPlate = new CaptionPlate(creation);
        currentPlate.x = workspaceX() + 16;
        currentPlate.setBottomAnchor(
          window.innerHeight - 16 - (creation.bottomInset ?? 0),
        );
        scene.add(currentPlate);

        currentBackChip = new BackChip(() => navigateTo(null));
        currentBackChip.setPosition(workspaceX() + 16, 16);
        scene.add(currentBackChip);

        currentFullscreenChip = new FullscreenChip((full) =>
          setFullscreen(full),
        );
        currentFullscreenChip.setPosition(window.innerWidth - 34 - 16, 16);
        scene.add(currentFullscreenChip);

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

  // Reposition + resize the mounted creation, its Stage backdrop, and the
  // bottom-left plate / top-left back chip to the current workspace band.
  // Shared by the fullscreen toggle and the rail-collapse toggle.
  function layoutWorkspaceEntity(): void {
    if (currentStage) {
      currentStage.setPosition(workspaceX(), 0);
      currentStage.width = workspaceW();
      currentStage.height = window.innerHeight;
    }
    if (currentEntity) {
      currentEntity.setPosition(workspaceX(), 0);
      applySize(currentEntity, workspaceW(), window.innerHeight);
    }
    if (currentPlate) currentPlate.x = workspaceX() + 16;
    if (currentBackChip) currentBackChip.setPosition(workspaceX() + 16, 16);
  }

  const setFullscreen = (full: boolean): void => {
    if (fullscreen === full) return;
    fullscreen = full;
    // Hide/show the rail; reposition + resize the mounted creation, stage,
    // and the two theater chips to the new workspace origin/width.
    if (full) scene.remove(rail);
    else scene.add(rail);
    layoutWorkspaceEntity();
    clipStackedCanvases();
    scene.markDirty();
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
    bed.setPosition(railWidth(), 0);
    bed.resize(workspaceW(), H, CREATIONS);

    if (currentStage) {
      currentStage.setPosition(workspaceX(), 0);
      currentStage.width = workspaceW();
      currentStage.height = H;
    }
    if (currentEntity) {
      applySize(currentEntity, workspaceW(), H);
    }
    if (currentPlate) {
      currentPlate.setBottomAnchor(
        H - 16 - (currentCreation?.bottomInset ?? 0),
      );
    }
    if (currentFullscreenChip) {
      currentFullscreenChip.setPosition(W - 34 - 16, 16);
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
  // core idle-throttle would otherwise starve. Forcing this unconditionally
  // for every entry was assumed to cost nothing extra, but a canvas
  // renderer repaints everything on any dirty frame — the real cost scales
  // with total on-screen content, so for a content-heavy creation that
  // already calls scene.markDirty() itself whenever it actually needs to
  // redraw (see the `chat` registry entry's `continuousRedraw: false`),
  // forcing it forever wastes real per-frame cost once the content is fully
  // loaded and idle (see forge/findings.md 2026-07-19). Default to `true`
  // (unset) so every other creation keeps today's behavior unchanged.
  keepSceneLive(scene, () => currentCreation?.continuousRedraw !== false);
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
