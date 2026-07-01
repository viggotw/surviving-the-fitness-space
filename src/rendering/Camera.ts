import * as THREE from "three";

const DEFAULT_VIEW_SIZE = 12;

/** Fixed isometric angle, orthographic projection, no free camera controls by default. */
export function createIsometricCamera(aspect: number, viewSize = DEFAULT_VIEW_SIZE): THREE.OrthographicCamera {
  const halfH = viewSize / 2;
  const halfW = halfH * aspect;
  const camera = new THREE.OrthographicCamera(-halfW, halfW, halfH, -halfH, 0.1, 100);
  camera.position.set(6, 6, 6);
  camera.lookAt(0, 0, 0);
  return camera;
}

export function updateCameraAspect(
  camera: THREE.OrthographicCamera,
  aspect: number,
  viewSize = DEFAULT_VIEW_SIZE,
): void {
  const halfH = viewSize / 2;
  const halfW = halfH * aspect;
  camera.left = -halfW;
  camera.right = halfW;
  camera.top = halfH;
  camera.bottom = -halfH;
  camera.updateProjectionMatrix();
}
