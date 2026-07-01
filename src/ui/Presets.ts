import { DEFAULT_PARAMETERS, type SimulationParameters } from "../simulation/Parameters";
import type { Simulation } from "../simulation/Simulation";

export interface Preset {
  name: string;
  params: Partial<SimulationParameters>;
}

// Stub for MVP — the full preset set (Stable drift, Narrow/Excessive variation,
// Fast environment, Fragmented landscape, Art mode, Explanation mode) is deferred.
export const PRESETS: Preset[] = [{ name: "Default", params: DEFAULT_PARAMETERS }];

export function applyPreset(simulation: Simulation, preset: Preset): void {
  simulation.setParams(preset.params);
  simulation.reset();
  simulation.seedPopulation(simulation.params.initialOrganisms);
}
