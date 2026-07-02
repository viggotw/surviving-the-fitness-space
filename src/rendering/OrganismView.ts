import * as THREE from "three";
import type { Organism } from "../simulation/Organism";
import { displayFallOffset, displayOpacity, displayScale } from "./Effects";

const RESTING_HEIGHT = 0.0;

/**
 * Renders the whole population as a single InstancedMesh (spec 10.2) so
 * organism count can scale into the hundreds without per-object overhead.
 * Dying organisms fall straight down out of view rather than fading in
 * place; instance color is still darkened toward death as a secondary cue
 * (true per-instance alpha would need a custom shader, deferred).
 */
export class OrganismView {
  readonly mesh: THREE.InstancedMesh;

  private readonly maxInstances: number;
  private readonly dummy = new THREE.Object3D();
  private readonly color = new THREE.Color();

  constructor(maxInstances: number) {
    this.maxInstances = maxInstances;

    const geometry = new THREE.SphereGeometry(1, 16, 12);
    const material = new THREE.MeshStandardMaterial({
      roughness: 0.55,
      metalness: 0.12,
      emissive: new THREE.Color(0x0a0a0a),
      emissiveIntensity: 0.35,
    });

    this.mesh = new THREE.InstancedMesh(geometry, material, maxInstances);
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.mesh.castShadow = true;
    this.mesh.receiveShadow = false;
    this.mesh.count = 0;
  }

  sync(organisms: ReadonlyArray<Organism>): void {
    const count = Math.min(organisms.length, this.maxInstances);
    this.mesh.count = count;

    for (let i = 0; i < count; i++) {
      const o = organisms[i];
      const scale = displayScale(o);
      const fallOffset = displayFallOffset(o);

      // Trait-space (x, y) maps to world (x, -y) on the horizontal plane; see FitnessPlane.
      this.dummy.position.set(o.x, scale + RESTING_HEIGHT + fallOffset, -o.y);
      this.dummy.scale.setScalar(scale);
      this.dummy.updateMatrix();
      this.mesh.setMatrixAt(i, this.dummy.matrix);

      const opacity = displayOpacity(o);
      this.color.setHSL(o.hue, 0.55, 0.65).multiplyScalar(0.3 + 0.7 * opacity);
      this.mesh.setColorAt(i, this.color);
    }

    this.mesh.instanceMatrix.needsUpdate = true;
    if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;
  }

  dispose(): void {
    this.mesh.geometry.dispose();
    (this.mesh.material as THREE.Material).dispose();
  }
}
