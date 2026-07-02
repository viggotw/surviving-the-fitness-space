# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

A browser-based visualization of natural selection as a continuous, non-directed process in an
abstract 2D fitness/trait space. Organisms (simple spheres) grow, burst into mutated offspring,
and disappear when the drifting "viable region" moves away from them. There is no goal, no
optimizer, and no synchronized generational update — only reproduction, heritable variation,
environmental drift, and filtering. Keep this framing in mind when naming things or writing UI
copy: avoid language implying intent or agency (e.g. "organism tries/searches/adapts"); prefer
"lineages persist", "variants disappear", "the environment filters".

This is currently an MVP: the simulation engine, isometric Three.js renderer, and a minimal dev
control panel. Deferred (not yet built): the full preset system, explanation-mode overlay content,
lineage trails, additional visual presets, image/video export, and accessibility/reduced-motion
modes.

## Commands

```
npm run dev          # start Vite dev server
npm run build         # type-check via tsc (noEmit) is NOT run automatically — see below
npm run preview       # preview a production build
npm test              # run the full Vitest suite once
npm run test:watch    # Vitest in watch mode
npx vitest run <path>  # run a single test file, e.g. src/simulation/Organism.test.ts
npx tsc --noEmit       # type-check the whole project (not wired into any npm script)
```

Tests live alongside the modules they cover (`Foo.ts` + `Foo.test.ts`) and are scoped to
`src/simulation/**/*.test.ts` only (see `vitest.config.ts`) — the simulation layer is designed to
be fully unit-testable without Three.js or a DOM. Rendering/UI code is verified manually in a
browser, not via Vitest.

## Architecture

The codebase enforces a strict one-way dependency: **simulation → rendering/UI never imports back**.

- `src/simulation/` — pure TypeScript, no `three` or DOM imports anywhere in this directory.
  - `Random.ts` — seeded PRNG (mulberry32); the *only* source of nondeterminism in the app. All
    randomness elsewhere (mutation, offspring placement, blob generation) flows through an
    injected `Random` instance so a given seed reproduces identical runs.
  - `Parameters.ts` — the `SimulationParameters` type and `DEFAULT_PARAMETERS`. Field names here
    are treated as a stable contract (e.g. `burstRadius`, `variationRadius`, `offspringCount`,
    `environmentDriftSpeed`) — extend rather than rename when adding features. `burstRadius` and
    `offspringCount` are deliberately *not* per-organism heritable traits: every organism reads
    them live from the current params each tick, so they act as global, controls-panel-driven
    rules ("grow to this predefined size, then pop into exactly this many children") rather than
    evolvable properties. Traits that *are* heritable/mutated per organism (`growthRate`,
    `variationRadius`, `hue`) still live on the `Organism` object itself.
  - `Landscape.ts` — the fitness landscape as moving/deforming metaball `ViabilityBlob`s.
    `isViable(x, y, time)` is strictly binary (no gradient fitness). `update()` statefully advances
    blob *position* (a persistent random-walk on heading, not a fixed straight-line drift, plus
    soft containment/clamp at bounds) and blob *population membership* (removing blobs whose life
    cycle has fully shrunk away, stochastically spawning new ones so the population hovers near
    `viabilityBlobCount`). Each blob's deformation (`phase`) and grow-in/hold/shrink-out envelope
    (`birthTime`, `growDuration`, `shrinkDuration`, `lifespan`) are instead pure functions of the
    `time` argument passed to `fieldValue`/`isViable` — every one of those fields is fixed once a
    blob exists, so viability queries stay reproducible without needing `update()` to have been
    called first, even though *which* blobs currently exist is itself state built up by `update()`
    calls. This is what makes shapes form out of nothing and shrink back out of existence, and
    keeps drift from settling into a repeating back-and-forth bounce.
  - `Organism.ts` — the `Organism` type and its asynchronous per-organism lifecycle
    (`alive → dying` on leaving a viable region, `alive → bursting → removed` on reaching the
    live `params.burstRadius`, spawning exactly `params.offspringCount` mutated offspring).
    `updateOrganism()` mutates the organism in place and *returns* any newly spawned offspring; it
    never appends to a population itself.
  - `Simulation.ts` — owns the organism array and the `Landscape`, steps everything by `dt`,
    and is the *only* place that enforces the population hard-cap and extinction/auto-reseed.
    Every burst always produces its full `offspringCount` brood; the cap is enforced *after*
    appending offspring by removing the oldest organisms until the population is back at
    `maxOrganisms`, rather than truncating newly spawned offspring. Removal prefers the oldest
    organisms *near this tick's new growth* first, falling back to the globally oldest only if a
    local excess can't be found (and, as an absolute last resort, into the newborns themselves if a
    single tick's offspring alone outnumber `maxOrganisms`). A naive globally-oldest-first removal
    was tried and rejected: it drains every other cluster in favor of whichever lineage currently
    reproduces fastest, collapsing the whole population into one spot instead of many independent
    lineages tracking the landscape — keep this local-first behavior if touching this logic.
    `Simulation`'s public surface
    (`getOrganisms()`, `getLandscape()`, `params`, `update()`, `setParams()`, `seedPopulation()`,
    `reset()`, `paused`) is the only thing rendering/UI code may touch.

- `src/rendering/` — Three.js. Reads simulation state every frame via `Renderer3D.sync(simulation)`
  but never advances simulation time itself.
  - `Camera.ts` — fixed isometric orthographic camera (no free camera controls by default).
  - `FitnessPlane.ts` — renders `Landscape.fieldValue` into an offscreen Canvas2D texture applied
    to a plane mesh (the required approach per the original spec; a shader-based landscape is a
    possible future alternative, not yet built). Throttled to redraw at most every
    `updateIntervalMs` (default 50ms) since the environment drifts slowly.
  - `OrganismView.ts` — renders the whole population as a single `THREE.InstancedMesh` (not one
    mesh per organism) so population can scale into the hundreds. Per-instance fade is
    approximated via scaling toward zero + darkening instance color, not true per-instance alpha
    (that would need a custom shader).
  - `Effects.ts` — pure functions computing display scale/opacity from an `Organism`'s state; no
    Three.js or Simulation coupling.
  - `Renderer3D.ts` — owns the scene graph, composes the above, and is the only class that imports
    both `three` and `Simulation`'s type.

- `src/ui/` — `Controls.ts` is a Tweakpane dev panel grouped into folders (Environment / Organisms
  / Population) so it's clear what governs the drifting viable regions vs. individual organism
  behavior vs. overall population bookkeeping. `Presets.ts` and `ExplanationOverlay.ts` are
  currently stubs (only a `Default` preset; overlay hidden with no content) — the full preset set
  and explanation-mode captions are deferred.

- `src/app/main.ts` — the only place the per-frame loop is wired:
  `simulation.update(dt) → renderer.sync(simulation) → renderer.render()`, with `dt` clamped to
  `1/20` so a backgrounded tab doesn't cause a simulation spiral on refocus.

## Known workarounds

- `src/types/tweakpane.d.ts` hand-declares the `tweakpane` module's types. Tweakpane 4.0.5's
  published `.d.ts` files import from `@tweakpane/core`, a scoped package that was never published
  for the v4 line — resolving it fails (`TS2307`) even though the library works fine at runtime.
  Extend this shim (rather than trying to fix upstream types) if new Tweakpane APIs are used.

## Notes for tuning

`Parameters.ts` and the metaball falloff in `Landscape.fieldValue` are tightly coupled to visual
scale: `WORLD_SIZE` (fitness-space half-extent), `viabilityBlobRadiusMin/Max`, and organism
`burstRadius`/`growthRate` all need to stay in proportion to each other, or the scene either fills
entirely with "viable" glow (no dark non-viable gaps, nothing ever dies) or organisms render
oversized relative to the plane. If retuning defaults, sanity-check visually in a browser rather
than by numbers alone — the emergent overlap/clustering behavior is hard to predict analytically.
