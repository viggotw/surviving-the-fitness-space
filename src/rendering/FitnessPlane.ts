import * as THREE from "three";
import { FIELD_THRESHOLD, type Landscape } from "../simulation/Landscape";

const GLOW = { r: 64, g: 200, b: 210 };
// const GLOW = { r: 254, g: 254, b: 254 };

/**
 * Half-width, in `fieldValue` units, of the smoothstep band around
 * `FIELD_THRESHOLD` used to anti-alias the boundary. Narrow enough that the
 * edge still reads as sharp rather than the old wide gradient falloff — this
 * only removes texel-grid staircasing, it doesn't blur the shape.
 */
const EDGE_BAND = 0.04;

function smoothstep(edge0: number, edge1: number, x: number): number {
  const t = Math.min(1, Math.max(0, (x - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}

/**
 * Renders the fitness landscape as a Canvas2D texture on a floating slab.
 * Sampling `Landscape.fieldValue` on the CPU is the required approach for the
 * first full version (spec 5.4); a shader-based option is deferred.
 */
export class FitnessPlane {
  readonly mesh: THREE.Mesh;

  private readonly canvas: HTMLCanvasElement;
  private readonly ctx: CanvasRenderingContext2D;
  private readonly texture: THREE.CanvasTexture;
  private readonly resolution: number;
  private readonly worldSize: number;
  private readonly updateIntervalMs: number;
  private lastUpdateMs = -Infinity;

  constructor(worldSize: number, resolution = 256, updateIntervalMs = 50) {
    this.worldSize = worldSize;
    this.resolution = resolution;
    this.updateIntervalMs = updateIntervalMs;

    this.canvas = document.createElement("canvas");
    this.canvas.width = resolution;
    this.canvas.height = resolution;
    const ctx = this.canvas.getContext("2d");
    if (!ctx) throw new Error("2D canvas context unavailable");
    this.ctx = ctx;

    this.texture = new THREE.CanvasTexture(this.canvas);
    this.texture.colorSpace = THREE.SRGBColorSpace;

    const geometry = new THREE.PlaneGeometry(worldSize, worldSize);
    const material = new THREE.MeshStandardMaterial({
      map: this.texture,
      roughness: 0.85,
      metalness: 0.05,
      transparent: true,
    });

    this.mesh = new THREE.Mesh(geometry, material);
    this.mesh.rotation.x = -Math.PI / 2;
    this.mesh.receiveShadow = true;
  }

  update(landscape: Landscape, time: number): void {
    const now = performance.now();
    if (now - this.lastUpdateMs < this.updateIntervalMs) return;
    this.lastUpdateMs = now;

    const { resolution, ctx, worldSize } = this;
    const half = worldSize / 2;
    const image = ctx.createImageData(resolution, resolution);

    for (let row = 0; row < resolution; row++) {
      // Plane's local V axis maps to world -Y after the -90deg X rotation.
      const y = half - (row / (resolution - 1)) * worldSize;
      for (let col = 0; col < resolution; col++) {
        const x = -half + (col / (resolution - 1)) * worldSize;
        // Anti-aliased binary edge: coverage is ~0 or ~1 almost everywhere,
        // transitioning smoothly only within EDGE_BAND of the viability
        // threshold, so the shape reads as sharp-edged rather than a soft
        // glow, without the staircase aliasing a hard per-texel cutoff gives.
        const field = landscape.fieldValue(x, y, time);
        const coverage = smoothstep(FIELD_THRESHOLD - EDGE_BAND, FIELD_THRESHOLD + EDGE_BAND, field);
        const idx = (row * resolution + col) * 4;

        // The void is genuinely transparent (alpha 0), not a flat black
        // fill, so nothing renders there at all — no lit-plane shading
        // artifact, and whatever's behind the scene shows through instead.
        image.data[idx] = GLOW.r;
        image.data[idx + 1] = GLOW.g;
        image.data[idx + 2] = GLOW.b;
        image.data[idx + 3] = coverage * 255;
      }
    }

    ctx.putImageData(image, 0, 0);
    this.texture.needsUpdate = true;
  }

  dispose(): void {
    this.mesh.geometry.dispose();
    (this.mesh.material as THREE.Material).dispose();
    this.texture.dispose();
  }
}
