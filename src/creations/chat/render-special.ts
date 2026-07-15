/**
 * Lazy-loads external renderers (Mermaid, KaTeX, abcjs) and converts their SVG
 * output into VectoJS Entity objects for embedding in the chat canvas transcript.
 *
 * Each renderer is fetched from a CDN exactly once; subsequent calls reuse the
 * cached global. The returned entity is a BitmapBlock that draws the pre-loaded
 * HTMLImageElement in its render() pass.
 *
 * Security note on SVG blob URLs: these are passed as `img.src`, not parsed as
 * HTML — browsers never execute scripts from image blob sources, so embedding
 * library-generated SVG strings there is safe. Direct `.innerHTML` assignment is
 * intentionally avoided; library DOM APIs are used instead.
 */
import { Entity, type Bounds, type IRenderer } from "@vectojs/core";
import type { SpecialType } from "./segment";

export type RenderSpecial = (
  type: SpecialType,
  code: string,
  maxWidth: number,
) => Promise<Entity | null>;

// ---------------------------------------------------------------------------
// BitmapBlock — canvas entity that draws a pre-rasterised HTMLImageElement
// ---------------------------------------------------------------------------
class BitmapBlock extends Entity {
  constructor(
    private bmp: HTMLImageElement,
    w: number,
    h: number,
  ) {
    super();
    this.width = w;
    this.height = h;
    this.interactive = false;
  }

  getBounds(): Bounds {
    return { x: 0, y: 0, width: this.width, height: this.height };
  }

  isPointInside(): boolean {
    return false;
  }

  render(r: IRenderer): void {
    r.drawImage(this.bmp, 0, 0, this.width, this.height);
  }
}

// ---------------------------------------------------------------------------
// SVG string → BitmapBlock (loaded as image blob — scripts cannot execute)
// ---------------------------------------------------------------------------
function svgToEntity(svgStr: string, maxWidth: number): Promise<Entity> {
  return new Promise((resolve, reject) => {
    const blob = new Blob([svgStr], { type: "image/svg+xml;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const img = new window.Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      const nw = img.naturalWidth || 600;
      const nh = img.naturalHeight || 200;
      if (nw === 0 || nh === 0) {
        reject(new Error("SVG has zero dimensions"));
        return;
      }
      const w = Math.min(maxWidth, nw);
      const h = (nh / nw) * w;
      resolve(new BitmapBlock(img, w, h));
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("SVG rasterisation failed"));
    };
    img.src = url;
  });
}

// ---------------------------------------------------------------------------
// Idempotent script / stylesheet loaders
// ---------------------------------------------------------------------------
const _loaded = new Set<string>();

function loadScript(src: string): Promise<void> {
  if (_loaded.has(src)) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const el = document.createElement("script");
    el.src = src;
    el.onload = () => {
      _loaded.add(src);
      resolve();
    };
    el.onerror = () => reject(new Error(`Failed to load ${src}`));
    document.head.appendChild(el);
  });
}

function loadStyle(href: string): void {
  if (_loaded.has(href)) return;
  _loaded.add(href);
  const el = document.createElement("link");
  el.rel = "stylesheet";
  el.href = href;
  document.head.appendChild(el);
}

// ---------------------------------------------------------------------------
// Mermaid
// ---------------------------------------------------------------------------
type MermaidGlobal = {
  initialize(cfg: Record<string, unknown>): void;
  render(id: string, text: string): Promise<{ svg: string }>;
};

let _mermaidReady = false;

async function renderMermaid(
  code: string,
  maxWidth: number,
): Promise<Entity | null> {
  if (!_mermaidReady) {
    await loadScript(
      "https://cdn.jsdelivr.net/npm/mermaid@11/dist/mermaid.min.js",
    );
    const m = (window as unknown as Record<string, MermaidGlobal>)["mermaid"];
    m.initialize({ startOnLoad: false, theme: "dark" });
    _mermaidReady = true;
  }
  const m = (window as unknown as Record<string, MermaidGlobal>)["mermaid"];
  const { svg } = await m.render(`mmd-${Date.now()}`, code.trim());
  return svgToEntity(svg, maxWidth);
}

// ---------------------------------------------------------------------------
// KaTeX — uses katex.render() (official DOM API) to avoid direct innerHTML
// ---------------------------------------------------------------------------
type KaTeXGlobal = {
  renderToString(tex: string, opts: Record<string, unknown>): string;
  render(tex: string, el: HTMLElement, opts: Record<string, unknown>): void;
};

let _katexReady = false;

async function renderMath(
  code: string,
  maxWidth: number,
): Promise<Entity | null> {
  if (!_katexReady) {
    loadStyle("https://cdn.jsdelivr.net/npm/katex@0.16/dist/katex.min.css");
    await loadScript(
      "https://cdn.jsdelivr.net/npm/katex@0.16/dist/katex.min.js",
    );
    _katexReady = true;
  }
  const katex = (window as unknown as Record<string, KaTeXGlobal>)["katex"];
  const tex = code.trim();

  // Use katex.render() (the official DOM API) so KaTeX manages its own node
  // construction — no direct innerHTML assignment needed.
  const probe = document.createElement("span");
  probe.style.cssText =
    "position:fixed;top:-9999px;left:0;visibility:hidden;padding:12px 20px;font-size:18px;";
  document.body.appendChild(probe);
  katex.render(tex, probe, { displayMode: true, throwOnError: false });
  const probeH = Math.max(48, probe.getBoundingClientRect().height + 24);
  document.body.removeChild(probe);

  // Build the SVG with MathML inside a foreignObject. The SVG is used only as
  // an image blob source, not embedded in the live DOM, so scripts cannot run.
  const mathml = katex.renderToString(tex, {
    output: "mathml",
    displayMode: true,
    throwOnError: false,
  });
  const w = Math.min(maxWidth, 600);
  const svgStr = [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${probeH}"`,
    ` viewBox="0 0 ${w} ${probeH}">`,
    `<rect width="${w}" height="${probeH}" fill="#0e1623"/>`,
    `<foreignObject x="0" y="0" width="${w}" height="${probeH}">`,
    `<div xmlns="http://www.w3.org/1999/xhtml"`,
    ` style="color:#e2e8f0;font-size:18px;padding:12px 20px;">`,
    mathml,
    `</div></foreignObject></svg>`,
  ].join("");

  return svgToEntity(svgStr, maxWidth);
}

// ---------------------------------------------------------------------------
// abcjs — renders via its own DOM API into a container we create
// ---------------------------------------------------------------------------
type AbcjsGlobal = {
  renderAbc(
    el: HTMLElement,
    abc: string,
    opts: Record<string, unknown>,
  ): unknown;
};

let _abcjsReady = false;

async function renderAbc(
  code: string,
  maxWidth: number,
): Promise<Entity | null> {
  if (!_abcjsReady) {
    await loadScript(
      "https://cdn.jsdelivr.net/npm/abcjs@6/dist/abcjs-basic-min.js",
    );
    _abcjsReady = true;
  }
  const ABCJS = (window as unknown as Record<string, AbcjsGlobal>)["ABCJS"];
  const container = document.createElement("div");
  container.style.cssText =
    "position:fixed;top:-9999px;left:0;width:600px;background:#0e1623;visibility:hidden;";
  document.body.appendChild(container);
  ABCJS.renderAbc(container, code.trim(), { responsive: "resize" });

  const svg = container.querySelector("svg");
  if (!svg) {
    document.body.removeChild(container);
    return null;
  }

  // Clone the SVG to a standalone document so we can serialise it cleanly.
  const clone = svg.cloneNode(true) as SVGSVGElement;
  clone.setAttribute("xmlns", "http://www.w3.org/2000/svg");

  // Restyle paths/lines for the dark background.
  for (const el of clone.querySelectorAll<SVGElement>(
    "path,line,ellipse,text,rect,polyline",
  )) {
    const fill = el.getAttribute("fill");
    const stroke = el.getAttribute("stroke");
    if (fill && fill !== "none") el.setAttribute("fill", "#c8d8f0");
    if (stroke && stroke !== "none") el.setAttribute("stroke", "#c8d8f0");
  }

  // Prepend a background rect.
  const vb = clone.getAttribute("viewBox")?.split(" ") ?? [];
  const bgW = vb[2] ?? clone.getAttribute("width") ?? "600";
  const bgH = vb[3] ?? clone.getAttribute("height") ?? "200";
  const bg = document.createElementNS("http://www.w3.org/2000/svg", "rect");
  bg.setAttribute("x", "0");
  bg.setAttribute("y", "0");
  bg.setAttribute("width", bgW);
  bg.setAttribute("height", bgH);
  bg.setAttribute("fill", "#0e1623");
  clone.insertBefore(bg, clone.firstChild);

  const serialiser = new XMLSerializer();
  const svgStr = serialiser.serializeToString(clone);
  document.body.removeChild(container);
  return svgToEntity(svgStr, maxWidth);
}

// ---------------------------------------------------------------------------
// Public export
// ---------------------------------------------------------------------------
export const renderSpecial: RenderSpecial = async (type, code, maxWidth) => {
  try {
    if (type === "mermaid") return await renderMermaid(code, maxWidth);
    if (type === "math") return await renderMath(code, maxWidth);
    if (type === "abc") return await renderAbc(code, maxWidth);
  } catch (err) {
    console.warn("[chat/render-special] failed to render", type, err);
  }
  return null;
};
