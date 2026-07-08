# VectoJS Three recipes

## Basic panel

```ts
import { Button, Stack, Text } from '@vectojs/ui';
import { ThreeAdapter } from '@vectojs/three';
import * as THREE from 'three';

const adapter = new ThreeAdapter({ width: 800, height: 500 });

const panel = new Stack({ direction: 'vertical', gap: 16 });
panel.setPosition(36, 36);
panel.add(new Text('VectoJS in 3D', { font: '700 28px Inter' }));
panel.add(new Button('Select', { onClick: () => console.log('selected') }));

adapter.vectoScene.add(panel);
adapter.vectoScene.start();
scene3d.add(adapter.mesh);
```

## Pointer routing

```ts
const raycaster = new THREE.Raycaster();
const pointer = new THREE.Vector2();

function handlePointer(event: PointerEvent, type: 'pointerdown' | 'pointerup' | 'pointermove' | 'click') {
  pointer.x = (event.clientX / window.innerWidth) * 2 - 1;
  pointer.y = -(event.clientY / window.innerHeight) * 2 + 1;
  raycaster.setFromCamera(pointer, camera);
  const handled = adapter.updateIntersection(raycaster, type, event);
  if (handled) event.preventDefault();
}
```

## Wheel routing

```ts
window.addEventListener(
  'wheel',
  (event) => {
    raycaster.setFromCamera(pointer, camera);
    if (adapter.updateIntersection(raycaster, 'wheel', event)) event.preventDefault();
  },
  { passive: false },
);
```

## Disposal

```ts
scene3d.remove(adapter.mesh);
adapter.dispose();
```
