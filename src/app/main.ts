import { Simulation } from "../simulation/Simulation";
import { DEFAULT_PARAMETERS, computeWorldBounds } from "../simulation/Parameters";
import { Renderer3D } from "../rendering/Renderer3D";
import { Controls } from "../ui/Controls";
import { ExplanationOverlay } from "../ui/ExplanationOverlay";
import { Music } from "../audio/Music";

const canvas = document.querySelector<HTMLCanvasElement>("#scene");
const controlsContainer = document.querySelector<HTMLElement>("#controls");
const overlayContainer = document.querySelector<HTMLElement>("#overlay");
if (!canvas || !controlsContainer || !overlayContainer) {
  throw new Error("index.html is missing a required #scene, #controls, or #overlay element");
}

const windowAspect = (): number => window.innerWidth / (window.innerHeight || 1) || 1;

const simulation = new Simulation(DEFAULT_PARAMETERS);
simulation.setBounds(computeWorldBounds(windowAspect()));
simulation.seedPopulation(simulation.params.initialOrganisms);

const renderer = new Renderer3D(canvas, simulation.params.maxOrganisms);
const music = new Music();
const controls = new Controls(controlsContainer, simulation, music, () => {
  simulation.reset();
  simulation.seedPopulation(simulation.params.initialOrganisms);
});
new ExplanationOverlay(overlayContainer).setVisible(false);

// Autoplay policies require a user gesture before any audio can play;
// Music.start() is idempotent, so the very first pointer interaction
// anywhere on the page is enough to kick it off.
window.addEventListener("pointerdown", () => music.start(), { once: true });

// Clamp dt so a backgrounded/refocused tab doesn't cause a simulation spiral.
const MAX_DT = 1 / 20;
let last = performance.now();

function frame(now: number): void {
  // Also floor at 0: the very first rAF timestamp can occasionally predate
  // the `performance.now()` captured just above, producing a negative dt.
  const dt = Math.max(0, Math.min((now - last) / 1000, MAX_DT));
  last = now;

  simulation.update(dt);
  renderer.sync(simulation);
  renderer.render();
  controls.update();

  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

window.addEventListener("resize", () => {
  renderer.resize(window.innerWidth, window.innerHeight);
  simulation.setBounds(computeWorldBounds(windowAspect()));
});

// Click anywhere on the scene to spawn a single organism there. If the
// click lands outside the viable region (or outside the world entirely),
// it just falls away like any other organism would — spawnOrganismAt
// reuses the exact same creation/lifecycle rules, no special-casing needed.
canvas.addEventListener("click", (event) => {
  const rect = canvas.getBoundingClientRect();
  const ndcX = ((event.clientX - rect.left) / rect.width) * 2 - 1;
  const ndcY = -((event.clientY - rect.top) / rect.height) * 2 + 1;
  const point = renderer.raycastToTraitSpace(ndcX, ndcY);
  if (point) simulation.spawnOrganismAt(point.x, point.y);
});
