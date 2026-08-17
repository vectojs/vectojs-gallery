import assert from 'node:assert/strict';
import puppeteer, { type Browser, type Page } from 'puppeteer-core';
import { bothEngines, closeServer, startDistServer } from './harness';

/**
 * The resident semantic tier and selection regions, in real engines.
 *
 * Both halves of this suite exist because jsdom cannot answer either question.
 *
 * `contentSemanticMargin: Infinity` is about whether off-viewport text is
 * **findable**, and the acceptance criterion in `vectojs-docs/TODO.md` is
 * explicit that it must be asserted on `display` / `innerText` / `window.find` /
 * the a11y tree and **never on `textContent`** — `textContent` reads straight
 * through `display: none`, which is exactly how the 1.31.0 defect passed a
 * benchmark and 13 unit tests while the text was invisible to every real
 * consumer. jsdom has no layout, so `display` is whatever the attribute says and
 * `window.find` does not exist.
 *
 * Selection regions are about DOM **order** of the projection, which only exists
 * once the engine has laid out and synced against a real canvas.
 *
 * This serves the real `dist/` from `bun run build` rather than re-bundling, so
 * what is measured is the artifact the site actually ships.
 */

/**
 * A transcript tall enough that most of it is far outside the viewport, with a
 * unique needle in the last block so a find can only succeed by reaching text
 * that the carrier window has certainly excluded.
 */
const NEEDLE = 'zqxjkvwpbf-resident-tier-needle';

const DOC_MARK = 'tsx';

/**
 * Every line carries `DOC_MARK` so the region classifier can identify it wherever
 * the projection splits it. This matters: a paragraph long enough to wrap projects
 * one <span> per *visual line*, and a continuation line inherits none of its
 * paragraph's leading words. An earlier version of this document used ordinary
 * prose and classified only lines starting with `Section`/`Paragraph`, so 15
 * wrapped continuation lines were labelled as chrome and reported as intruders
 * inside the transcript run — a false failure that looked exactly like the real
 * defect.
 */
function buildDocument(): string {
  const parts: string[] = [`# ${DOC_MARK} resident tier probe\n`];
  for (let i = 0; i < 40; i++) {
    parts.push(`## ${DOC_MARK} section ${i}\n`);
    // Kept short enough not to wrap, so one block is one projected line.
    parts.push(`${DOC_MARK} body paragraph ${i}\n`);
  }
  parts.push(`${DOC_MARK} final block ${NEEDLE}\n`);
  return parts.join('\n');
}

interface Probe {
  blockCount: number;
  needleDisplay: string | null;
  needleInInnerText: boolean;
  windowFindNeedle: boolean | null;
  needleOffscreenBy: number;
  viewportHeight: number;
  /** Projected DOM order, as region tags, for the selection-region assertion. */
  regionSequence: string[];
  /** Text nodes belonging to the transcript. Zero means the probe found nothing. */
  transcriptNodeCount: number;
  /** Non-transcript tags found *inside* the transcript's run. */
  intruders: string[];
  transcriptRunIsContiguous: boolean;
}

async function probe(page: Page, doc: string): Promise<Probe> {
  // Stream at the maximum the UI allows. At the default 100 tokens/s this document
  // takes minutes, which is what timed Firefox out at 60s on the first run. Driven
  // through the panel's real <input> rather than by reaching into the entity, so it
  // also covers `positionRateInput` still placing that input somewhere reachable.
  // The panel builds its <input> when the creation mounts, which sits behind a
  // font-ready gate — so it does not exist yet at `networkidle2`. Firefox reached
  // this line first on the initial run and threw 'rate input not found'; a probe
  // confirmed both engines create it identically once mounted, so this is a
  // missing wait rather than an engine difference.
  await page.waitForFunction(
    () => Array.from(document.querySelectorAll('input')).some((el) => el.type === 'number'),
    { timeout: 30_000, polling: 100 },
  );
  await page.evaluate(() => {
    const input = Array.from(document.querySelectorAll('input')).find((el) => el.type === 'number');
    if (!input) throw new Error('rate input not found in the DOM');
    input.value = '10000';
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });

  // Load the document the way a user does — a real drop event carrying a File.
  await page.evaluate((markdown: string) => {
    const file = new File([markdown], 'probe.md', { type: 'text/markdown' });
    const dt = new DataTransfer();
    dt.items.add(file);
    document.dispatchEvent(new DragEvent('drop', { dataTransfer: dt, bubbles: true }));
  }, doc);

  // Wait for the transcript to materialize rather than sleeping: the stream
  // reveals progressively, so the needle's block is among the last to exist.
  await page.waitForFunction(
    (needle: string) => {
      const root = document.querySelector('[data-vecto-a11y-root]') ?? document.body;
      return root.textContent?.includes(needle) === true;
    },
    { timeout: 60_000, polling: 250 },
    NEEDLE,
  );

  // The reader auto-follows the streaming tail, so the needle's block ends up ON
  // screen and the probe would measure the interaction tier, not the coarse one.
  // Scroll back to the top and let the projection re-sync.
  await page.evaluate(() => {
    window.dispatchEvent(new WheelEvent('wheel', { deltaY: -400_000, bubbles: true }));
  });
  await page.waitForFunction(
    () => {
      const root = document.querySelector('[data-vecto-a11y-root]') ?? document.body;
      const first = Array.from(root.querySelectorAll<HTMLElement>('*')).find(
        (el) => el.textContent?.includes('resident tier probe') === true,
      );
      if (!first) return false;
      // Settled at the top when the first block's box is at or below the top edge.
      return first.getBoundingClientRect().top > -50;
    },
    { timeout: 30_000, polling: 250 },
  );

  return page.evaluate(
    ([needle, mark]: [string, string]) => {
      const root = document.querySelector('[data-vecto-a11y-root]') ?? document.body;
      const all = Array.from(root.querySelectorAll<HTMLElement>('*'));

      // The element holding the needle. Deepest match, so it is the text carrier
      // rather than an ancestor container.
      const holders = all.filter((el) => el.textContent?.includes(needle) === true);
      const needleEl = holders.length > 0 ? holders[holders.length - 1]! : null;

      let needleDisplay: string | null = null;
      let needleOffscreenBy = 0;
      if (needleEl) {
        needleDisplay = getComputedStyle(needleEl).display;
        const r = needleEl.getBoundingClientRect();
        needleOffscreenBy = r.top - window.innerHeight;
      }

      // innerText, NOT textContent: innerText respects `display: none`, which is
      // the entire point of the assertion.
      const rootInnerText = (root as HTMLElement).innerText ?? '';

      let windowFindNeedle: boolean | null = null;
      const finder = (window as unknown as { find?: (s: string) => boolean }).find;
      if (typeof finder === 'function') {
        try {
          windowFindNeedle = finder.call(window, needle);
        } catch {
          windowFindNeedle = null;
        }
      }

      // Walk the projection's TEXT NODES in DOM order and label each by region, then
      // require the transcript's nodes to form ONE unbroken run — a DOM Selection
      // covers everything between anchor and focus in DOM order, so an unbroken run
      // is exactly what makes a drag unable to escape.
      //
      // Deliberately NOT keyed on `[data-vecto-id]`: measured, those are the 17
      // *interactive* projections (IMG/BUTTON/DIV chrome controls) and not one of
      // them carries transcript text, so a `[data-vecto-id]` filter yields zero
      // transcript entries and makes `firstDoc === -1` — an assertion that passes
      // without testing anything. Transcript text lives in plain <span>s.
      const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
      const regionSequence: string[] = [];
      let node: Node | null = walker.nextNode();
      while (node) {
        const text = (node.textContent ?? '').trim();
        if (text.length > 0) {
          if (text.includes(mark)) {
            regionSequence.push('doc');
          } else {
            // Carry the text into the label so a failure is diagnosable rather than
            // just a count.
            regionSequence.push(`other:${text.slice(0, 24)}`);
          }
        }
        node = walker.nextNode();
      }
      const firstDoc = regionSequence.indexOf('doc');
      const lastDoc = regionSequence.lastIndexOf('doc');
      const intruders =
        firstDoc === -1
          ? ['NO TRANSCRIPT TEXT FOUND']
          : regionSequence.slice(firstDoc, lastDoc + 1).filter((tag) => tag !== 'doc');
      const transcriptRunIsContiguous = firstDoc !== -1 && intruders.length === 0;

      return {
        blockCount: all.filter((el) => el.hasAttribute('data-vecto-id')).length,
        transcriptNodeCount: regionSequence.filter((t) => t === 'doc').length,
        intruders,
        needleDisplay,
        needleInInnerText: rootInnerText.includes(needle),
        windowFindNeedle,
        needleOffscreenBy,
        viewportHeight: window.innerHeight,
        regionSequence,
        transcriptRunIsContiguous,
      };
    },
    [NEEDLE, DOC_MARK] as [string, string],
  );
}

async function run(): Promise<void> {
  const { server, origin } = await startDistServer();
  const url = `${origin}/#/creation/chat`;

  const doc = buildDocument();
  let failures = 0;

  for (const engine of bothEngines()) {
    let browser: Browser | null = null;
    try {
      browser = await puppeteer.launch({
        browser: engine.browser,
        executablePath: engine.executablePath,
        headless: true,
        args: engine.browser === 'chrome' ? ['--no-sandbox', '--window-size=1280,800'] : [],
      });
      const page = await browser.newPage();
      await page.setViewport({ width: 1280, height: 800 });
      await page.goto(url, { waitUntil: 'networkidle2', timeout: 60_000 });

      const p = await probe(page, doc);

      // The needle's block must be genuinely far off-viewport, or the test proves
      // nothing about the resident tier.
      assert.ok(
        p.needleOffscreenBy > p.viewportHeight,
        `${engine.name}: needle block is only ${Math.round(p.needleOffscreenBy)}px past the ` +
          `viewport (${p.viewportHeight}px tall); it must be further out than one ` +
          `viewport for this to exercise the coarse tier`,
      );

      // The acceptance criterion, asserted the three permitted ways.
      assert.notEqual(
        p.needleDisplay,
        'none',
        `${engine.name}: off-viewport block is display:none — this is the 1.31.0 ` +
          `defect, where textContent still read it but no real consumer could`,
      );
      assert.ok(
        p.needleInInnerText,
        `${engine.name}: off-viewport text absent from innerText (display-aware), ` +
          `so a screen reader's read-ahead cannot reach it`,
      );
      if (p.windowFindNeedle !== null) {
        assert.ok(
          p.windowFindNeedle,
          `${engine.name}: window.find could not locate off-viewport text`,
        );
      }

      // Selection regions: the transcript's carriers must form one unbroken run.
      // Guard against a vacuous pass: an empty transcript would make "contiguous"
      // trivially true. This is not hypothetical — the first version of this probe
      // keyed on `[data-vecto-id]`, found 0 transcript nodes, and passed.
      assert.ok(
        p.transcriptNodeCount > 20,
        `${engine.name}: only ${p.transcriptNodeCount} transcript text nodes found; ` +
          `the contiguity assertion below would be vacuous`,
      );
      assert.ok(
        p.transcriptRunIsContiguous,
        `${engine.name}: ${p.intruders.length} non-transcript text node(s) ` +
          `(${[...new Set(p.intruders)].join(',')}) sit inside the transcript's DOM run — ` +
          `a drag through the transcript would select them too`,
      );

      const findNote =
        p.windowFindNeedle === null
          ? 'window.find unavailable'
          : `window.find ${p.windowFindNeedle}`;
      console.log(
        `${engine.name}: ${p.blockCount} carriers, needle ${Math.round(p.needleOffscreenBy)}px ` +
          `off-viewport, display=${p.needleDisplay}, innerText ${p.needleInInnerText}, ${findNote}, ` +
          `${p.transcriptNodeCount} transcript nodes in one contiguous run`,
      );
    } catch (error) {
      failures++;
      console.error(`${engine.name}: FAILED`, error);
    } finally {
      await browser?.close();
    }
  }

  await closeServer(server);

  if (failures > 0) throw new Error(`${failures} engine(s) failed`);
  console.log('semantic-margin + selection-region gate passed in both engines');
}

await run();
