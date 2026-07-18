/**
 * `IRenderer`'s public surface (fillText/fillCircle/roundRect/…) has no
 * `textAlign`, `textBaseline`, `measureText`, or transform-based icon
 * animation — this reader's controls and text layout need all of them.
 * The Gallery's shared Scene always uses the default Canvas2D renderer
 * (no custom `renderer` override is passed to `new Scene()`), so every
 * `IRenderer` instance actually handed to `render()` is a `CanvasRenderer`
 * exposing a real `ctx`. This type names that one deliberate exception
 * instead of reaching for `any`.
 */
export interface RawRenderer {
  ctx: CanvasRenderingContext2D;
}
