import * as THREE from "three";
import type { Landscape } from "../simulation/Landscape";

const GRAPHITE = { r: 18, g: 20, b: 24 };
const GLOW = { r: 64, g: 200, b: 210 };

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

  constructor(worldSize: number, resolution = 128, updateIntervalMs = 50) {
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
        const field = Math.min(1, landscape.fieldValue(x, y, time));
        const idx = (row * resolution + col) * 4;

        image.data[idx] = GRAPHITE.r + (GLOW.r - GRAPHITE.r) * field;
        image.data[idx + 1] = GRAPHITE.g + (GLOW.g - GRAPHITE.g) * field;
        image.data[idx + 2] = GRAPHITE.b + (GLOW.b - GRAPHITE.b) * field;
        image.data[idx + 3] = 255;
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
