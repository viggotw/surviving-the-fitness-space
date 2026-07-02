import * as THREE from "three";
import type { Simulation } from "../simulation/Simulation";
import { computeWorldBounds } from "../simulation/Parameters";
import { createIsometricCamera, updateCameraAspect } from "./Camera";
import { FitnessPlane } from "./FitnessPlane";
import { OrganismView } from "./OrganismView";

/**
 * Owns the Three.js scene graph. Only ever *reads* simulation state through
 * `Simulation`'s public surface — it never advances simulation time itself.
 */
export class Renderer3D {
  private readonly renderer: THREE.WebGLRenderer;
  private readonly scene: THREE.Scene;
  private readonly camera: THREE.OrthographicCamera;
  private readonly fitnessPlane: FitnessPlane;
  private readonly organismView: OrganismView;
  private readonly raycaster = new THREE.Raycaster();
  private readonly groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);

  constructor(canvas: HTMLCanvasElement, maxOrganisms: number) {
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setClearColor(0x000000, 0);
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;

    // No opaque scene background: the fitness plane's non-viable area is a
    // genuinely transparent void, so the page behind the canvas shows
    // through rather than a flat color painted by the 3D scene.
    this.scene = new THREE.Scene();

    const initialAspect = canvas.clientWidth / (canvas.clientHeight || 1) || 1;
    this.camera = createIsometricCamera(initialAspect);

    const ambient = new THREE.AmbientLight(0xffffff, 0.6);
    const key = new THREE.DirectionalLight(0xffffff, 0.8);
    key.position.set(6, 10, 4);
    key.castShadow = true;
    key.shadow.mapSize.set(1024, 1024);
    key.shadow.camera.left = -10;
    key.shadow.camera.right = 10;
    key.shadow.camera.top = 10;
    key.shadow.camera.bottom = -10;
    this.scene.add(ambient, key);

    const initialBounds = computeWorldBounds(initialAspect);
    this.fitnessPlane = new FitnessPlane(initialBounds.width, initialBounds.height);
    this.scene.add(this.fitnessPlane.mesh);

    this.organismView = new OrganismView(maxOrganisms);
    this.scene.add(this.organismView.mesh);

    this.resize(canvas.clientWidth || window.innerWidth, canvas.clientHeight || window.innerHeight);
  }

  /**
   * Converts a click in normalized device coordinates (each in [-1, 1]) to a
   * trait-space (x, y) point, by casting the isometric camera's ray onto the
   * infinite ground plane (y = 0) — not just the finite fitness-plane mesh,
   * so a click anywhere on screen resolves to *some* trait-space point, even
   * one far outside the world's current bounds. Returns null only in the degenerate case
   * where the ray is parallel to the ground (never happens for this fixed,
   * downward-looking camera, but Three.js's API can return null).
   */
  raycastToTraitSpace(ndcX: number, ndcY: number): { x: number; y: number } | null {
    this.raycaster.setFromCamera(new THREE.Vector2(ndcX, ndcY), this.camera);
    const point = new THREE.Vector3();
    const hit = this.raycaster.ray.intersectPlane(this.groundPlane, point);
    if (!hit) return null;
    // Trait-space (x, y) maps to world (x, -y); see FitnessPlane/OrganismView.
    return { x: point.x, y: -point.z };
  }

  resize(width: number, height: number): void {
    this.renderer.setSize(width, height, false);
    const aspect = width / (height || 1) || 1;
    updateCameraAspect(this.camera, aspect);
    const bounds = computeWorldBounds(aspect);
    this.fitnessPlane.resize(bounds.width, bounds.height);
  }

  sync(simulation: Simulation): void {
    this.fitnessPlane.update(simulation.getLandscape(), simulation.time, simulation.params.edgeFadeWidth);
    this.organismView.sync(simulation.getOrganisms());
  }

  render(): void {
    this.renderer.render(this.scene, this.camera);
  }

  dispose(): void {
    this.fitnessPlane.dispose();
    this.organismView.dispose();
    this.renderer.dispose();
  }
}
