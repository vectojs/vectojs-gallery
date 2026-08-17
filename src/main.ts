import { Scene, Entity, WebGPUParticleSystemManager } from '@vectojs/core';
import { coreWasmUrl } from '@vectojs/core/wasm';
import { CREATIONS, type Creation } from './registry';
import { APPS } from './apps';
import { Bed } from './ui/Bed';
import { Rail } from './ui/Rail';
import { CaptionPlate } from './ui/CaptionPlate';
import { Stage } from './ui/Stage';
import { BackChip } from './ui/BackChip';
import { keepSceneLive } from './keep-live';
import { GALLERY_SCENE_OPTIONS, SHELL_MAX_FPS } from './shell-config';
import { FULL_RAIL_WIDTH, getShellLayout, type ShellLayout } from './ui/shell-layout';

const HASH_PREFIX = '#/creation/';

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

/**
 * Opt the Scene into the WebGPU particle compute pass.
 *
 * The engine ships `WebGPUParticleSystemManager` but does not install it
 * itself: `Scene` only builds one if a class was handed to this static, so an
 * app that never calls it silently runs every `ComputeParticleEntity` on the
 * CPU no matter what the hardware supports. `nexus` advertises "simulated on a
 * WebGPU compute pass" and, before this call existed, did not do that on any
 * machine — and because `particleBackend` defaults to `'auto'` rather than an
 * explicit `'webgpu'`, the fallback was silent rather than an error.
 *
 * Registration is a static on the class, so it must happen before the Scene is
 * constructed; module scope guarantees that.
 */
Scene.registerWebGPUParticleSystemManager(WebGPUParticleSystemManager);

function hasResizeTo(entity: Entity): entity is Entity & ResizableEntity {
  return typeof (entity as Partial<ResizableEntity>).resizeTo === 'function';
}

function applySize(entity: Entity, width: number, height: number): void {
  if (hasResizeTo(entity)) entity.resizeTo(width, height);
  else {
    entity.width = width;
    entity.height = height;
  }
}

function initGallery(): void {
  const canvas = document.getElementById('gallery-canvas') as HTMLCanvasElement | null;
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
  // `a11ySyncInterval: 0` = sync the content-projection DOM mirror every frame,
  // so native text selection stays glued to the scrolling canvas instead of
  // lagging it. This was previously throttled to 100ms because the mirror
  // materialized one DOM node per block for the WHOLE document (~14.8k nodes on
  // a large doc) and repositioning them every frame was a dominant cost. Since
  // @vectojs/core now viewport-virtualizes the projection (only ~visible-count
  // nodes exist; see forge/findings.md 2026-07-21), per-frame sync is cheap
  // again — measured no scroll-fps regression on a 346KB doc — so the throttle
  // (and its visible selection lag) is no longer needed.
  const scene = new Scene(canvas, GALLERY_SCENE_OPTIONS);

  let currentEntity: Entity | null = null;
  let currentPlate: CaptionPlate | null = null;
  let currentStage: Stage | null = null;
  let currentBackChip: BackChip | null = null;
  let currentCreation: Creation | null = null;
  let shellLayout: ShellLayout = getShellLayout(window.innerWidth, window.innerHeight);
  // Catalog + creation views both let the user collapse the rail to a thin
  // brand strip so the cards / creation get the width back.
  let railCollapsed = shellLayout.mode === 'medium';
  let loadSeq = 0;
  let stopLivePump: (() => void) | null = null;
  // `undefined` (not `null`) so the very first call to loadCreation(null) —
  // the fresh-page-load, no-hash case — never short-circuits against this
  // sentinel; `null` is a legitimate `id` value (the catalog view itself),
  // so it can't double as "nothing has loaded yet".
  let activeId: string | null | undefined = undefined;

  const bed = new Bed(
    shellLayout.contentWidth,
    shellLayout.contentHeight,
    (creation) => navigateTo(creation),
    () => scene.markDirty(),
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
    FULL_RAIL_WIDTH,
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
  // Workspace origin/width depend on whether the rail is collapsed to its thin
  // brand strip.
  const workspaceX = (): number => shellLayout.contentX;
  const workspaceY = (): number => shellLayout.contentY;
  const workspaceW = (): number => shellLayout.contentWidth;
  const workspaceH = (): number => shellLayout.contentHeight;

  const teardownCurrent = (): void => {
    stopLivePump?.();
    stopLivePump = null;
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
    // Restore shell defaults before whatever mounts next gets a chance to run.
    // A creation may have switched the shared Scene to `onDemand` below.
    //
    // `maxFPS` is restored here rather than by the creation that changed it:
    // `nexus` exposes a max-FPS dropdown that writes the shared Scene, and
    // when it reset the value itself on unmount it wrote a literal `60` that
    // did not match this shell's uncapped default, silently capping every
    // creation opened afterwards. The shell owns the default, so the shell
    // restores it.
    scene.renderMode = 'always';
    scene.maxFPS = SHELL_MAX_FPS;
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
    for (const c of host.querySelectorAll('canvas')) {
      if (c === canvas) continue;
      const el = c as HTMLCanvasElement;
      // Clip only the portion that actually overlaps the rail: a creation-
      // owned canvas already positioned at the workspace offset (e.g.
      // Dimension's Three.js canvas) must NOT lose its left edge.
      const rect = el.getBoundingClientRect();
      const overlapX = Math.max(0, shellLayout.contentX - rect.left);
      const overlapY = Math.max(0, shellLayout.contentY - rect.top);
      el.style.clipPath =
        overlapX > 0 || overlapY > 0 ? `inset(${overlapY}px 0 0 ${overlapX}px)` : '';
    }
  };

  // Positions + sizes the catalog Bed to the current workspace band (right of
  // whatever width the rail currently occupies).
  const layoutBed = (): void => {
    bed.setPosition(workspaceX(), workspaceY());
    bed.resize(workspaceW(), workspaceH(), CREATIONS);
  };
  layoutBed();

  const showCatalog = (): void => {
    teardownCurrent();
    scene.renderMode = 'onDemand';
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
    shellLayout = collapsed
      ? getShellLayout(window.innerWidth, window.innerHeight, 'medium')
      : getShellLayout(window.innerWidth, window.innerHeight);
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
    currentStage = new Stage(workspaceW(), workspaceH(), creation.stage);
    currentStage.setPosition(workspaceX(), workspaceY());
    scene.add(currentStage);

    creation
      .load()
      .then(({ default: EntityClass }) => {
        if (seq !== loadSeq) return; // superseded by a later selection
        currentEntity = new EntityClass();
        currentEntity.setPosition(workspaceX(), workspaceY());
        applySize(currentEntity, workspaceW(), workspaceH());
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
        scene.renderMode = creation.continuousRedraw === false ? 'onDemand' : 'always';
        if (creation.continuousRedraw !== false) stopLivePump = keepSceneLive(scene);
        currentPlate = new CaptionPlate(creation);
        currentPlate.x = workspaceX() + 16;
        currentPlate.setBottomAnchor(window.innerHeight - 16 - (creation.bottomInset ?? 0));
        scene.add(currentPlate);

        currentBackChip = new BackChip(() => navigateTo(null));
        currentBackChip.setPosition(workspaceX() + 16, workspaceY() + 16);
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

  // Reposition + resize the mounted creation, its Stage backdrop, and the
  // bottom-left plate / top-left back chip to the current workspace band.
  // Used by the rail-collapse toggle.
  function layoutWorkspaceEntity(): void {
    if (currentStage) {
      currentStage.setPosition(workspaceX(), workspaceY());
      currentStage.width = workspaceW();
      currentStage.height = workspaceH();
    }
    if (currentEntity) {
      currentEntity.setPosition(workspaceX(), workspaceY());
      applySize(currentEntity, workspaceW(), workspaceH());
    }
    if (currentPlate) currentPlate.x = workspaceX() + 16;
    if (currentBackChip) currentBackChip.setPosition(workspaceX() + 16, workspaceY() + 16);
  }

  const setHash = (id: string | null): void => {
    const next = id ? `${HASH_PREFIX}${id}` : '';
    if (window.location.hash !== next) {
      if (next) window.location.hash = next;
      else history.replaceState(null, '', window.location.pathname + window.location.search);
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

    shellLayout = getShellLayout(W, H);
    if (shellLayout.mode !== 'compact') {
      railCollapsed = shellLayout.mode === 'medium';
      rail.setCollapsed(railCollapsed);
    }
    rail.setCompact(shellLayout.mode === 'compact', W, H);
    bed.setPosition(workspaceX(), workspaceY());
    bed.resize(workspaceW(), workspaceH(), CREATIONS);

    if (currentStage) {
      currentStage.setPosition(workspaceX(), workspaceY());
      currentStage.width = workspaceW();
      currentStage.height = workspaceH();
    }
    if (currentEntity) {
      currentEntity.setPosition(workspaceX(), workspaceY());
      applySize(currentEntity, workspaceW(), workspaceH());
    }
    if (currentPlate) {
      currentPlate.setBottomAnchor(H - 16 - (currentCreation?.bottomInset ?? 0));
    }
    clipStackedCanvases();

    scene.markDirty();
  };

  let resizeFrame = 0;
  window.addEventListener('resize', () => {
    if (resizeFrame) return;
    resizeFrame = requestAnimationFrame(() => {
      resizeFrame = 0;
      resize();
    });
  });

  window.addEventListener('hashchange', () => {
    const id = creationIdFromHash();
    const match = id ? (CREATIONS.find((c) => c.id === id) ?? null) : null;
    loadCreation(match);
  });

  resize();
  const initialId = creationIdFromHash();
  const initialCreation = initialId ? (CREATIONS.find((c) => c.id === initialId) ?? null) : null;
  loadCreation(initialCreation);

  scene.start();

  // Install the WASM particle kernel for the CPU simulation path. This is the
  // fallback that runs whenever the WebGPU compute pass above is unavailable
  // (no `navigator.gpu`, or a device request that fails), and without it that
  // fallback is a plain JS loop with two `Math.hypot` calls per particle per
  // frame. Fire-and-forget after `start()`: instantiation is async, resolves
  // `false` rather than throwing when the platform declines, and the JS path
  // stays correct in the meantime — so there is nothing to await and nothing
  // to handle.
  //
  // `coreWasmUrl` is the package's own resolved URL for the binary it ships;
  // a bare `new URL('@vectojs/core/…', import.meta.url)` cannot work, because
  // `new URL` only resolves *relative* refs and never consults package
  // `exports` (see the export's own doc comment).
  void scene.enableWasmParticles(coreWasmUrl);
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
    void fonts.load('400 16px Inter');
  } catch {
    // `load()` throws on malformed descriptors only; ignore and fall through.
  }
  return Promise.race([
    fonts.ready.then(() => undefined),
    new Promise<void>((resolve) => setTimeout(resolve, 1500)),
  ]);
}

window.addEventListener('DOMContentLoaded', () => {
  void whenFontsReady().then(initGallery);
});
