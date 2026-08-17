import { readFileSync, existsSync } from 'node:fs';
import { createServer, type Server } from 'node:http';
import { dirname, join, extname } from 'node:path';
import { fileURLToPath } from 'node:url';
import puppeteer, { type Browser, type Page } from 'puppeteer-core';

export const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
export const distDir = join(repoRoot, 'dist');

const MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.wasm': 'application/wasm',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.woff2': 'font/woff2',
};

export interface BrowserCase {
  name: string;
  browser: 'chrome' | 'firefox';
  executablePath: string;
}

function executable(candidates: string[], label: string): string {
  const path = candidates.find((candidate) => candidate.length > 0 && existsSync(candidate));
  if (!path) throw new Error(`No ${label} executable found (${candidates.join(', ')})`);
  return path;
}

export function bothEngines(): BrowserCase[] {
  return [
    {
      name: 'chromium',
      browser: 'chrome',
      executablePath: executable(
        [
          process.env.PUPPETEER_EXECUTABLE_PATH ?? '',
          '/usr/bin/chromium',
          '/usr/bin/google-chrome',
        ],
        'Chromium',
      ),
    },
    {
      name: 'firefox',
      browser: 'firefox',
      executablePath: executable(
        [process.env.FIREFOX_EXECUTABLE_PATH ?? '', '/usr/bin/firefox'],
        'Firefox',
      ),
    },
  ];
}

export async function startDistServer(): Promise<{
  server: Server;
  origin: string;
}> {
  if (!existsSync(join(distDir, 'index.html'))) {
    throw new Error(`dist/index.html missing - run 'bun run build' before this suite`);
  }
  const server = createServer((req, res) => {
    const url = (req.url ?? '/').split('?')[0]!;
    const rel = url === '/' ? 'index.html' : decodeURIComponent(url).replace(/^\/+/, '');
    const file = join(distDir, rel);
    if (!file.startsWith(distDir) || !existsSync(file)) {
      res.writeHead(404).end('not found');
      return;
    }
    res.writeHead(200, {
      'content-type': MIME[extname(file)] ?? 'application/octet-stream',
      'cross-origin-opener-policy': 'same-origin',
      'cross-origin-embedder-policy': 'require-corp',
    });
    res.end(readFileSync(file));
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const port = (server.address() as { port: number }).port;
  return { server, origin: `http://127.0.0.1:${port}` };
}

export async function closeServer(server: Server): Promise<void> {
  await new Promise<void>((resolve, reject) =>
    server.close((error) => (error ? reject(error) : resolve())),
  );
}

export async function launchPage(
  engine: BrowserCase,
  url: string,
  viewport = { width: 1280, height: 800 },
): Promise<{ browser: Browser; page: Page }> {
  const browser = await puppeteer.launch({
    browser: engine.browser,
    executablePath: engine.executablePath,
    headless: true,
    args:
      engine.browser === 'chrome'
        ? ['--no-sandbox', `--window-size=${viewport.width},${viewport.height}`]
        : [],
  });
  const page = await browser.newPage();
  await page.setViewport(viewport);
  await page.goto(url, { waitUntil: 'networkidle2', timeout: 60_000 });
  return { browser, page };
}
