# VectoJS responsive layout recipes

## Container-driven resize

```ts
const scene = new Scene(canvas, { disableWindowResize: true });
scene.renderMode = 'onDemand';

const resize = () => {
  const rect = container.getBoundingClientRect();
  scene.resize(Math.round(rect.width), Math.round(rect.height));
  layoutRoot(rect.width, rect.height);
  scene.markDirty();
};

const observer = new ResizeObserver(resize);
observer.observe(container);
resize();

return () => {
  observer.disconnect();
  scene.destroy();
};
```

## Breakpoint-driven layout

```ts
function layoutRoot(width: number, height: number) {
  const narrow = width < 720;

  shell.direction = narrow ? 'vertical' : 'horizontal';
  shell.gap = narrow ? 12 : 20;
  shell.maxWidth = width - 32;
  shell.maxHeight = height - 32;

  sidebar.visible = !narrow;
  content.setPosition(narrow ? 16 : 280, 16);
  content.width = narrow ? width - 32 : width - 312;

  shell.layout();
}
```

## Form panel pattern

```ts
const form = new Stack({ direction: 'vertical', gap: 12 });
form.add(new Text('Settings', { font: '700 24px Inter' }));
form.add(new Input({ width: 320, placeholder: 'Project name' }));
form.add(new Toggle({ label: 'Enabled', checked: true }));
form.add(new Button('Save'));

const card = new Card({ width: 384, height: 280, padding: 24, label: 'Settings' });
form.setPosition(24, 24);
card.add(form);
```

## Long content boundary

Use `ScrollView`, `VirtualList`, or `TreeView` when content can exceed the visible region. Keep toolbars, sticky controls, and overlays outside the clipped region unless they should scroll with content.
