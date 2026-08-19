import assert from 'node:assert/strict';
import type { ElementHandle, Page } from 'puppeteer-core';
import { bothEngines, closeServer, launchPage, startDistServer } from './harness';

const CREATIONS = [
  ['studio', 'Add rectangle'],
  ['dimension', 'Decrease particle count'],
  ['catch', 'Start'],
  ['nexus', '✦ Reform'],
  ['compare-pretext', 'Accordion'],
  ['chat', 'Token rate value'],
] as const;

async function a11yElement(page: Page, label: string): Promise<ElementHandle<Element>> {
  const element = await page.waitForSelector(`[aria-label=${JSON.stringify(label)}]`, {
    timeout: 30_000,
  });
  assert.ok(element, `missing projected control: ${label}`);
  return element;
}

async function pressA11y(page: Page, label: string): Promise<void> {
  const element = await a11yElement(page, label);
  await element.focus();
  await page.keyboard.press('Enter');
}

async function absent(page: Page, label: string): Promise<boolean> {
  return page.$(`[aria-label=${JSON.stringify(label)}]`).then((node) => node === null);
}

async function probeLifecycle(page: Page, origin: string): Promise<void> {
  await a11yElement(page, 'Open Canvas Studio — a Fabric.js-style editor');
  const preview = await a11yElement(
    page,
    'Canvas Studio editor with layered shapes and selection handles',
  );
  const previewBox = await preview.boundingBox();
  assert.ok(previewBox, 'Studio preview has no pointer geometry');

  await page.mouse.click(previewBox.x + previewBox.width / 2, previewBox.y + previewBox.height / 2);
  await a11yElement(page, 'Add rectangle');
  assert.equal(new URL(page.url()).hash, '#/creation/studio');
  const railEntry = await a11yElement(page, 'Canvas Studio — a Fabric.js-style editor');
  const railBox = await railEntry.boundingBox();
  const backBox = await (await a11yElement(page, 'Back to gallery')).boundingBox();
  assert.ok(railBox && railBox.width > 0, 'medium creation view collapsed the navigation rail');
  assert.ok(
    backBox && backBox.x >= 280,
    'creation workspace overlaps the expanded navigation rail',
  );
  await pressA11y(page, 'Back to gallery');
  await a11yElement(page, 'Open Dimension');
  assert.ok(await absent(page, 'Add rectangle'), 'Studio controls leaked after unmount');

  const returnedStudioCard = await a11yElement(
    page,
    'Open Canvas Studio — a Fabric.js-style editor',
  );
  const beforeScroll = await returnedStudioCard.boundingBox();
  assert.ok(beforeScroll, 'Studio card missing before wheel scroll');
  await page.mouse.move(68, 240);
  await page.mouse.wheel({ deltaY: 500 });
  await new Promise((resolve) => setTimeout(resolve, 400));
  const afterScroll = await returnedStudioCard.boundingBox();
  assert.ok(afterScroll, 'Studio card missing after wheel scroll');
  assert.ok(
    afterScroll.y < beforeScroll.y - 100,
    `catalog blank-area wheel did not scroll: ${beforeScroll.y} -> ${afterScroll.y}`,
  );

  for (const [id, expectedLabel] of CREATIONS) {
    await page.evaluate((nextId) => {
      window.location.hash = `#/creation/${nextId}`;
    }, id);
    const control = await a11yElement(page, expectedLabel);
    await control.focus();
    assert.equal(
      await page.evaluate(
        (label) => document.activeElement?.getAttribute('aria-label') === label,
        expectedLabel,
      ),
      true,
      `${id}: projected control did not receive keyboard focus`,
    );
    if (id === 'compare-pretext') {
      await pressA11y(page, 'Accordion');
      await a11yElement(page, 'Back to all demos');
      await pressA11y(page, 'Back to all demos');
      await a11yElement(page, 'Accordion');
    }
    await a11yElement(page, 'Back to gallery');
  }

  await page.evaluate(() => {
    window.location.hash = '#/creation/dimension';
    window.location.hash = '#/creation/studio';
    window.location.hash = '#/creation/catch';
  });
  await a11yElement(page, 'Fruit Catch game. Use the left and right arrow keys to move the plate.');
  assert.ok(
    await absent(page, 'Add rectangle'),
    'superseded Studio continuation published controls',
  );
  assert.ok(
    await absent(page, 'Decrease particle count'),
    'superseded Dimension continuation published controls',
  );

  await page.evaluate(() => {
    window.location.hash = '#/creation/chat';
  });
  await a11yElement(page, 'Token rate value');
  assert.ok((await page.$$('input')).length >= 1, 'Stream Reader input was not projected');
  await pressA11y(page, 'Back to gallery');
  await a11yElement(page, 'Open Fruit Catch');
  assert.equal((await page.$$('input')).length, 0, 'creation DOM inputs leaked into the catalog');
  const catalogCanvases = await page.$$eval('canvas', (canvases) =>
    canvases.map((canvas) => ({
      id: canvas.id,
      width: canvas.width,
      height: canvas.height,
    })),
  );
  assert.ok(
    catalogCanvases.length <= 2,
    `unexpected creation-owned canvas leaked into the catalog: ${JSON.stringify(catalogCanvases)}`,
  );

  await page.setViewport({ width: 390, height: 844 });
  await page.reload({ waitUntil: 'networkidle2' });
  await pressA11y(page, 'Menu');
  await a11yElement(page, 'Canvas Studio — a Fabric.js-style editor');
  await pressA11y(page, 'Close');
  assert.ok(await absent(page, 'Canvas Studio — a Fabric.js-style editor'));
  assert.ok(page.url().startsWith(origin));
}

async function run(): Promise<void> {
  const { server, origin } = await startDistServer();
  let failures = 0;
  for (const engine of bothEngines()) {
    let browser: Awaited<ReturnType<typeof launchPage>>['browser'] | null = null;
    try {
      const launched = await launchPage(engine, `${origin}/`);
      browser = launched.browser;
      await probeLifecycle(launched.page, origin);

      console.log(`${engine.name}: six creations, races, cleanup, compact nav passed`);
    } catch (error) {
      failures++;
      console.error(`${engine.name}: FAILED`, error);
    } finally {
      await browser?.close();
    }
  }
  await closeServer(server);
  if (failures > 0) throw new Error(`${failures} engine(s) failed`);
  console.log('full-gallery role and lifecycle gate passed in both engines');
}

await run();
