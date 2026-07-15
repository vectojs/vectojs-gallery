/**
 * Generates positions for the ambient particle field: `count` points uniformly
 * scattered inside a sphere of the given radius, packed as [x,y,z, x,y,z, …] for
 * a THREE.BufferAttribute. Pure and GPU-free so it can be unit-tested; the demo
 * wraps the result in a THREE.Points and rebuilds it when the +/- stepper is clicked.
 */
export function buildParticlePositions(
  count: number,
  radius: number,
): Float32Array {
  const out = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) {
    // Rejection-free uniform-in-sphere: direction on the unit sphere, radius by cube-root.
    const u = Math.random();
    const v = Math.random();
    const theta = 2 * Math.PI * u;
    const phi = Math.acos(2 * v - 1);
    const r = radius * Math.cbrt(Math.random());
    const sinPhi = Math.sin(phi);
    out[i * 3] = r * sinPhi * Math.cos(theta);
    out[i * 3 + 1] = r * sinPhi * Math.sin(theta);
    out[i * 3 + 2] = r * Math.cos(phi);
  }
  return out;
}
