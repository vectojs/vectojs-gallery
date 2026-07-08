# VectoJS core scene recipes

## Minimal accessible entity

```ts
import { Entity, type IRenderer, Scene } from '@vectojs/core';

class Dot extends Entity {
  constructor() {
    super();
    this.width = 48;
    this.height = 48;
    this.interactive = true;
    this.on('click', () => this.animate({ scaleX: 1.2, scaleY: 1.2 }, 120));
  }

  isPointInside(globalX: number, globalY: number): boolean {
    const local = this.worldToLocal(globalX, globalY);
    return !!local && Math.hypot(local.x - 24, local.y - 24) <= 24;
  }

  getA11yAttributes() {
    return { tag: 'button' as const, role: 'button', label: 'Animated dot' };
  }

  render(renderer: IRenderer): void {
    renderer.beginPath();
    renderer.arc(24, 24, 24, 0, Math.PI * 2);
    renderer.fill('#22d3ee');
  }
}

const canvas = document.querySelector<HTMLCanvasElement>('canvas')!;
const scene = new Scene(canvas, { maxFPS: 60 });
scene.renderMode = 'onDemand';
scene.add(new Dot().setPosition(80, 80));
scene.start();
```

## Host framework mounting pattern

```ts
const scene = new Scene(canvas, {
  maxFPS: 60,
  pointBackend: 'canvas',
  particleBackend: 'cpu',
});
scene.renderMode = 'onDemand';

const resize = () => scene.resize(container.clientWidth, container.clientHeight);
resize();
window.addEventListener('resize', resize);
scene.start();

return () => {
  window.removeEventListener('resize', resize);
  scene.destroy();
};
```

## Testing through semantics

```ts
await page.getByRole('button', { name: 'Animated dot' }).click();
await page.getByRole('textbox', { name: 'Project name' }).fill('Launch');
```

Prefer role-based tests over coordinate clicks unless testing hit-testing itself.
