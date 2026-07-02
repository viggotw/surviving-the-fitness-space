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
/** Texels per trait-space unit, fixed so texture sharpness doesn't change as the (now aspect-dependent) plane size changes. Matches the original 256/10 square resolution. */
const PIXELS_PER_UNIT = 25.6;

/**
 * Floor brightness (as a fraction of `GLOW`) at the point of lowest fitness
 * within the fade band, i.e. right at the true edge. Kept well above 0 (not
 * a fade to black/transparent) so the floor still reads as solid ground an
 * organism is genuinely standing on, just dimmer — see the `update()` doc
 * comment on why opacity and brightness are deliberately different curves.
 */
const MIN_FADE_BRIGHTNESS = 0.35;

export class FitnessPlane {
  readonly mesh: THREE.Mesh;

  private readonly canvas: HTMLCanvasElement;
  private readonly ctx: CanvasRenderingContext2D;
  private texture: THREE.CanvasTexture;
  private readonly updateIntervalMs: number;
  private width: number;
  private height: number;
  private lastUpdateMs = -Infinity;

  constructor(width: number, height: number, updateIntervalMs = 50) {
    this.width = width;
    this.height = height;
    this.updateIntervalMs = updateIntervalMs;

    this.canvas = document.createElement("canvas");
    this.canvas.width = Math.max(1, Math.round(width * PIXELS_PER_UNIT));
    this.canvas.height = Math.max(1, Math.round(height * PIXELS_PER_UNIT));
    const ctx = this.canvas.getContext("2d");
    if (!ctx) throw new Error("2D canvas context unavailable");
    this.ctx = ctx;

    this.texture = new THREE.CanvasTexture(this.canvas);
    this.texture.colorSpace = THREE.SRGBColorSpace;

    const geometry = new THREE.PlaneGeometry(width, height);
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

  /** Rebuilds the plane's geometry and texture resolution for a new rectangular world size (e.g. on window resize). */
  resize(width: number, height: number): void {
    if (width === this.width && height === this.height) return;
    this.width = width;
    this.height = height;

    this.canvas.width = Math.max(1, Math.round(width * PIXELS_PER_UNIT));
    this.canvas.height = Math.max(1, Math.round(height * PIXELS_PER_UNIT));

    const oldGeometry = this.mesh.geometry;
    this.mesh.geometry = new THREE.PlaneGeometry(width, height);
    oldGeometry.dispose();

    // A resized canvas can't be reused in place by the existing CanvasTexture
    // (WebGL keeps the GPU-side texture at the old dimensions and a partial
    // update then overflows it) — replace the texture object itself instead.
    const oldTexture = this.texture;
    this.texture = new THREE.CanvasTexture(this.canvas);
    this.texture.colorSpace = THREE.SRGBColorSpace;
    (this.mesh.material as THREE.MeshStandardMaterial).map = this.texture;
    (this.mesh.material as THREE.MeshStandardMaterial).needsUpdate = true;
    oldTexture.dispose();

    this.lastUpdateMs = -Infinity; // force a redraw on the next update() despite the throttle
  }

  update(landscape: Landscape, time: number, edgeFadeWidth = 0): void {
    const now = performance.now();
    if (now - this.lastUpdateMs < this.updateIntervalMs) return;
    this.lastUpdateMs = now;

    const { ctx, width, height } = this;
    const resX = this.canvas.width;
    const resY = this.canvas.height;
    const halfW = width / 2;
    const halfH = height / 2;
    const image = ctx.createImageData(resX, resY);

    for (let row = 0; row < resY; row++) {
      // Plane's local V axis maps to world -Y after the -90deg X rotation.
      const y = halfH - (row / (resY - 1)) * height;
      for (let col = 0; col < resX; col++) {
        const x = -halfW + (col / (resX - 1)) * width;
        const field = landscape.fieldValue(x, y, time);
        const idx = (row * resX + col) * 4;

        // Opacity (coverage) is a tiny anti-alias-only band — the floor is
        // fully solid everywhere an organism can actually stand (anywhere
        // isViable) and genuinely transparent (alpha 0) only right at/beyond
        // that same boundary Organism.ts's alive/dying check uses. This is
        // deliberately independent of edgeFadeWidth: an organism is still
        // fully "alive" throughout the interior fade band (see
        // Landscape.fitnessAt), so its floor must stay solid there too — a
        // shared, wider transparency band made organisms look like they were
        // hovering over a hole once they entered the low-fitness band.
        const coverage = smoothstep(FIELD_THRESHOLD - EDGE_BAND, FIELD_THRESHOLD + EDGE_BAND, field);

        // Brightness is the wider, edgeFadeWidth-driven ramp instead — same
        // formula as Landscape.fitnessAt, kept local here to avoid a second
        // fieldValue evaluation per pixel. This is what actually reads as
        // "the edge fading", purely as a dimmer (not vanishing) floor color.
        // edgeFadeWidth <= 0 skips the ramp entirely (uniform brightness) so
        // it reproduces the original render exactly, not just approximately
        // — dividing by a near-zero width would otherwise carve a visible
        // dark ring into the tiny anti-alias band itself.
        const brightness = edgeFadeWidth <= 0
          ? 1
          : MIN_FADE_BRIGHTNESS + (1 - MIN_FADE_BRIGHTNESS) * Math.min(1, Math.max(0, (field - FIELD_THRESHOLD) / edgeFadeWidth));

        image.data[idx] = GLOW.r * brightness;
        image.data[idx + 1] = GLOW.g * brightness;
        image.data[idx + 2] = GLOW.b * brightness;
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
