import { Simulation } from "../simulation/Simulation";
import { DEFAULT_PARAMETERS } from "../simulation/Parameters";
import { Renderer3D } from "../rendering/Renderer3D";
import { Controls } from "../ui/Controls";
import { ExplanationOverlay } from "../ui/ExplanationOverlay";

const canvas = document.querySelector<HTMLCanvasElement>("#scene");
const controlsContainer = document.querySelector<HTMLElement>("#controls");
const overlayContainer = document.querySelector<HTMLElement>("#overlay");
if (!canvas || !controlsContainer || !overlayContainer) {
  throw new Error("index.html is missing a required #scene, #controls, or #overlay element");
}

const simulation = new Simulation(DEFAULT_PARAMETERS);
simulation.seedPopulation(simulation.params.initialOrganisms);

const renderer = new Renderer3D(canvas, simulation.params.maxOrganisms);
const controls = new Controls(controlsContainer, simulation, () => {
  simulation.reset();
  simulation.seedPopulation(simulation.params.initialOrganisms);
});
new ExplanationOverlay(overlayContainer).setVisible(false);

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
});
