import * as THREE from "three";
import type { Simulation } from "../simulation/Simulation";
import { WORLD_SIZE } from "../simulation/Parameters";
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

    this.camera = createIsometricCamera(canvas.clientWidth / (canvas.clientHeight || 1) || 1);

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

    this.fitnessPlane = new FitnessPlane(WORLD_SIZE * 2);
    this.scene.add(this.fitnessPlane.mesh);

    this.organismView = new OrganismView(maxOrganisms);
    this.scene.add(this.organismView.mesh);

    this.resize(canvas.clientWidth || window.innerWidth, canvas.clientHeight || window.innerHeight);
  }

  resize(width: number, height: number): void {
    this.renderer.setSize(width, height, false);
    updateCameraAspect(this.camera, width / (height || 1) || 1);
  }

  sync(simulation: Simulation): void {
    this.fitnessPlane.update(simulation.getLandscape(), simulation.time);
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
