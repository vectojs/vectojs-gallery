/**
 * Sample the opaque pixels of rendered text into a list of [x, y] target points,
 * centered in a `width`×`height` box. The particle field uses these as spring
 * origins so the cloud settles into the word's shape.
 */
export function sampleTextPoints(
  text: string,
  width: number,
  height: number,
  step = 4,
): Float32Array {
  if (typeof document === "undefined") return new Float32Array(0);
  const c = document.createElement("canvas");
  c.width = width;
  c.height = height;
  const ctx = c.getContext("2d", { willReadFrequently: true });
  if (!ctx) return new Float32Array(0);

  // Size the font to fill ~78% of the width, capped so it stays on one line.
  let fontSize = Math.min(height * 0.5, width * 0.26);
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  const fit = (px: number) => {
    ctx.font = `800 ${px}px "Playfair Display", Georgia, serif`;
    return ctx.measureText(text).width;
  };
  while (fontSize > 12 && fit(fontSize) > width * 0.82) fontSize -= 4;

  ctx.fillStyle = "#fff";
  ctx.font = `800 ${fontSize}px "Playfair Display", Georgia, serif`;
  ctx.fillText(text, width / 2, height / 2);

  const { data } = ctx.getImageData(0, 0, width, height);
  const pts: number[] = [];
  for (let y = 0; y < height; y += step) {
    for (let x = 0; x < width; x += step) {
      if (data[(y * width + x) * 4 + 3] > 128) {
        pts.push(x, y);
      }
    }
  }
  return new Float32Array(pts);
}
