import { Scene } from '@vectojs/core';
import {
  awaitStart,
  calibrateRefreshRate,
  reportFailure,
  reportResult,
} from '../../../vectojs/benchmarks/_shared/client';
import { percentile, summarize } from '../../../vectojs/benchmarks/_shared/stats';
import StreamReader from '../../src/creations/chat';
import { GALLERY_SCENE_OPTIONS } from '../../src/shell-config';
import { FULL_RAIL_WIDTH } from '../../src/ui/shell-layout';

const params = new URLSearchParams(location.search);
/** `--param phases=1` adds per-phase attribution; off by default. */
const PHASES = params.get('phases') === '1';
const TARGET_KIB = Number(params.get('documentKiB') ?? 350);
const TOKEN_RATE = Number(params.get('tokenRate') ?? 10_000);

interface ReaderProbe {
  openFile(file: File): Promise<void>;
  state: {
    content: string;
    cursor: number;
    tokens: string[];
    status: 'idle' | 'streaming' | 'paused' | 'done';
    tokenRate: number;
  };
  markdownView: { content: { children: unknown[] }; height: number };
}

function makeDocument(targetChars: number): string {
  const sections: string[] = [];
  let length = 0;
  for (let index = 0; length < targetChars; index++) {
    const section = `
## Streaming section ${index}

This paragraph exercises **incremental Markdown**, inline \`code\`, a [link](https://vectojs.org), and enough prose to wrap across several lines in the reader viewport. It repeats realistic technical language rather than one unbroken synthetic token.

> The retained document should reuse stable blocks while only reconciling the changing tail. Section ${index} keeps the source unique.

- item ${index}.1 with descriptive text
- item ${index}.2 with **emphasis** and \`const value = ${index}\`
- item ${index}.3 with a nested-looking continuation that wraps naturally

| Metric | Value | Note |
| --- | ---: | --- |
| section | ${index} | streamed incrementally |
| parity | ${index % 2 === 0 ? 'even' : 'odd'} | deterministic corpus |

\`\`\`ts
export function section${index}(input: number): number {
  return input * ${index + 1};
}
\`\`\`

`;
    sections.push(section);
    length += section.length;
  }
  return sections.join('').slice(0, targetChars);
}

function nextFrame(): Promise<number> {
  return new Promise((resolve) => requestAnimationFrame(resolve));
}

async function main(): Promise<void> {
  await awaitStart();
  const refreshHz = await calibrateRefreshRate(1000);
  const budgetMs = 1000 / refreshHz;
  const started = performance.now();
  const source = makeDocument(TARGET_KIB * 1024);

  const canvas = document.createElement('canvas');
  canvas.width = innerWidth;
  canvas.height = innerHeight;
  document.body.appendChild(canvas);

  const scene = new Scene(canvas, GALLERY_SCENE_OPTIONS);
  scene.resize(innerWidth, innerHeight);
  const reader = new StreamReader();
  reader.setPosition(FULL_RAIL_WIDTH, 0);
  reader.resizeTo(innerWidth - FULL_RAIL_WIDTH, innerHeight);
  scene.add(reader);

  const probe = reader as unknown as ReaderProbe;
  await probe.openFile(new File([source], 'large-markdown.md', { type: 'text/markdown' }));
  probe.state.tokenRate = TOKEN_RATE;

  // Opt-in, because the probes call `performance.now()` on the frame path and the
  // whole-frame figures above are the ones quoted for pacing. Enabled after the
  // document is loaded so the one-off parse/materialize spike is excluded and the
  // shares describe steady-state streaming.
  if (PHASES) scene.setPhaseTiming(true);

  const costs: number[] = [];
  const intervals: number[] = [];
  let previousTimestamp = await nextFrame();
  while (probe.state.status !== 'done') {
    const timestamp = await nextFrame();
    const interval = timestamp - previousTimestamp;
    intervals.push(interval);
    previousTimestamp = timestamp;
    const frameStarted = performance.now();
    scene.step(interval || budgetMs);
    costs.push(performance.now() - frameStarted);
  }

  // Let the controller's final close/worker settlement publish the last block.
  for (let frame = 0; frame < Math.ceil(refreshHz / 2); frame++) {
    const timestamp = await nextFrame();
    intervals.push(timestamp - previousTimestamp);
    previousTimestamp = timestamp;
    const frameStarted = performance.now();
    scene.step(budgetMs);
    costs.push(performance.now() - frameStarted);
  }

  const costStats = summarize(costs);
  const intervalStats = summarize(intervals);
  const result = await reportResult({
    name: 'gallery-chat-large',
    refreshHz,
    params: {
      documentKiB: +(source.length / 1024).toFixed(1),
      tokenRate: TOKEN_RATE,
      tokens: probe.state.tokens.length,
      viewport: {
        width: innerWidth,
        height: innerHeight,
        dpr: devicePixelRatio,
      },
      note: 'Real Gallery StreamReader and file-load path. One scene.step per real rAF while the 350KiB mixed Markdown stream is active at 10k tokens/s, followed by 0.5s settlement. Frame cost and rAF interval are reported separately. This is a stress measurement, not a claim that every active frame must fit a 240Hz budget while every block remains materialized.',
    },
    summary: {
      budgetMs: +budgetMs.toFixed(4),
      frameCostP50Ms: +costStats.median.toFixed(4),
      frameCostP99Ms: +percentile(costs, 0.99).toFixed(4),
      frameCostMaxMs: +costStats.max.toFixed(4),
      frameIntervalP50Ms: +intervalStats.median.toFixed(4),
      frameIntervalP99Ms: +percentile(intervals, 0.99).toFixed(4),
      budgetHitSharePct: +(
        (100 * intervals.filter((value) => value <= budgetMs * 1.1).length) /
        intervals.length
      ).toFixed(1),
      droppedIntervals: intervals.filter((value) => value > budgetMs * 1.5).length,
      longIntervals: intervals.filter((value) => value > 50).length,
      frames: costs.length,
      finalBlocks: probe.markdownView.content.children.length,
      finalHeight: +probe.markdownView.height.toFixed(1),
    },
    // Phases go in `rows` so the runner aggregates them across iterations the way
    // it does any other per-row metric. `render` reports a null share by design —
    // it encloses transform/drawWalk/flush — so it is emitted as -1 to keep the
    // column numeric.
    // Sorted by phase NAME, not by cost. `renderPhases` returns most-expensive
    // first, which reorders between iterations and makes the runner's cross-run
    // aggregation warn that "arms may be misaligned" and compare row 3 of one run
    // against a different phase in the next.
    rows: PHASES
      ? [...scene.renderPhases]
          .sort((a, b) => a.phase.localeCompare(b.phase))
          .map((entry) => ({
            phase: entry.phase,
            totalMs: +entry.totalMs.toFixed(3),
            avgMs: +entry.avgMs.toFixed(4),
            maxMs: +entry.maxMs.toFixed(3),
            calls: entry.calls,
            sharePct: entry.share === null ? -1 : +entry.share.toFixed(2),
          }))
      : [],
    durationMs: +(performance.now() - started).toFixed(1),
  });

  const pre = document.createElement('pre');
  pre.textContent = JSON.stringify(result, null, 2);
  document.body.appendChild(pre);
  reader.destroy();
  scene.destroy();
}

main().catch((error) => reportFailure('gallery-chat-large', error));
