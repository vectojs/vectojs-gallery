# VectoJS video export recipes

## Scene contract

```ts
import { Scene } from '@vectojs/core';

const scene = new Scene(document.querySelector<HTMLCanvasElement>('canvas')!);
// Add entities before exposing the scene.
(window as Window & { vectoScene?: Scene }).vectoScene = scene;
scene.start();
```

## CLI

```bash
vecto-export ./my-animation.ts -o output.mp4 -w 1920 -h 1080 -f 60 -d 5
vecto-export http://localhost:5173 -o output.mp4 -f 60 -d 5
```

When using package managers directly:

```bash
bunx vecto-export ./my-animation.ts -o output.mp4
npx vecto-export ./my-animation.ts -o output.mp4
```

## API

```ts
import { exportVideo } from '@vectojs/video-exporter';

const controller = new AbortController();

await exportVideo({
  url: './my-animation.ts',
  outputPath: './out.mp4',
  width: 1920,
  height: 1080,
  fps: 60,
  duration: 10,
  signal: controller.signal,
});
```

## Environment

```bash
PUPPETEER_EXECUTABLE_PATH=/opt/chrome/chrome vecto-export ./scene.ts
VECTO_CHROMIUM_NO_SANDBOX=1 vecto-export ./scene.ts
```

Use `VECTO_CHROMIUM_NO_SANDBOX=1` only when the runtime environment requires it.
