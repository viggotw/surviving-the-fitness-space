import { Simulation } from "../simulation/Simulation";
import { DEFAULT_PARAMETERS, computeWorldBounds } from "../simulation/Parameters";
import { Renderer3D } from "../rendering/Renderer3D";
import { Controls } from "../ui/Controls";
import { ExplanationOverlay } from "../ui/ExplanationOverlay";
import { StatsHud } from "../ui/StatsHud";
import { Music } from "../audio/Music";
import { SpawnBudget } from "./SpawnBudget";

const canvas = document.querySelector<HTMLCanvasElement>("#scene");
const controlsContainer = document.querySelector<HTMLElement>("#controls");
const overlayContainer = document.querySelector<HTMLElement>("#overlay");
const statsContainer = document.querySelector<HTMLElement>("#stats");
if (!canvas || !controlsContainer || !overlayContainer || !statsContainer) {
  throw new Error("index.html is missing a required #scene, #controls, #overlay, or #stats element");
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
const statsHud = new StatsHud(statsContainer);
const spawnBudget = new SpawnBudget();

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
  // Scaled by timeScale to keep pace with the run: SpawnBudget's other timing
  // input (timeSinceExtinction) is simulation time, so feeding it unscaled
  // wall-clock dt would have its two clocks disagree about how long 30s is the
  // moment the speed control leaves 1×.
  spawnBudget.update(dt * simulation.timeScale, simulation.isExtinct, simulation.timeSinceExtinction);
  music.updateEnvironment(simulation.getLandscape().getEnvironmentStats(simulation.time), simulation.params.viabilityBlobRadiusMax);
  for (let i = 0; i < simulation.burstsThisTick; i++) music.playPop(simulation.population);
  for (let i = 0; i < simulation.fallsThisTick; i++) music.playFall(simulation.population);
  renderer.sync(simulation);
  renderer.render();
  controls.update();
  statsHud.update(
    simulation.burstCount,
    simulation.deadCount,
    simulation.runTime,
    spawnBudget.remaining,
    simulation.isExtinct,
    simulation.timeSinceExtinction,
  );

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
// Gated on spawnBudget: a click with no spawns left is simply a no-op.
canvas.addEventListener("click", (event) => {
  if (!spawnBudget.tryConsume()) return;
  const rect = canvas.getBoundingClientRect();
  const ndcX = ((event.clientX - rect.left) / rect.width) * 2 - 1;
  const ndcY = -((event.clientY - rect.top) / rect.height) * 2 + 1;
  const point = renderer.raycastToTraitSpace(ndcX, ndcY);
  if (point) simulation.spawnOrganismAt(point.x, point.y);
});
