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
    `environmentDriftSpeed`) — extend rather than rename when adding features. `burstRadius`,
    `growthRate`, and `offspringCount` are deliberately *not* per-organism heritable traits: every
    organism reads them live from the current params each tick, so they act as global,
    controls-panel-driven rules ("grow at this predefined rate to this predefined size, then pop
    into exactly this many children") rather than evolvable properties — growth and bursting are
    both fully deterministic given an organism's age. Traits that *are* heritable/mutated per
    organism (`variationRadius`, `hue`) still live on the `Organism` object itself, alongside
    `spawnDelay` — a small delay (uniform in `[0, growthStartDelayMax]`) drawn fresh at spawn, not
    inherited, that a newly created organism waits out before it starts growing. `growthRate` used
    to be heritable/mutated too, but sharing one global rate plus this delay is the fix for a
    real bug: with growth (and bursting) fully deterministic, an entire cohort born in the same
    tick would otherwise grow and burst in perfect lockstep forever, and the population would
    visibly "blink" in sync once enough cohorts converged onto shared phase. `spawnDelay` is the
    only source of randomness in the growth cycle, kept deliberately small — just enough to break
    lockstep, not enough to visibly stagger growth.
  - `Landscape.ts` — the fitness landscape as moving/deforming metaball `ViabilityBlob`s.
    `isViable(x, y, time)` is strictly binary (no gradient fitness). `update()` statefully advances
    blob *position* (a persistent random-walk on heading, not a fixed straight-line drift, plus
    soft containment/clamp at bounds) and blob *population membership* (removing blobs whose life
    cycle has fully shrunk away, stochastically spawning new ones so the population hovers near
    `viabilityBlobCount`). That spawn rate is **deficit-driven** — proportional to how far the
    current count sits below the `MAX_POPULATION_SLACK` ceiling, scaled by `refillGain`, which is
    solved so births (∝ shortfall) and deaths (∝ count) balance exactly at `viabilityBlobCount`.
    An earlier open-loop version set the rate from the target alone, ignoring the current count;
    that makes the population a free random walk that spends ~10% of a run at half the target or
    less and can sit at one or two blobs for minutes, which reads on screen as the whole
    lava-lamp landscape decaying into a few small circles a few minutes in. Keep the feedback term
    if touching this. Relatedly, the initial cohort is seeded *aged into its hold phase*
    (`createBlob`'s `agedIntoHold`): full-size at t=0, so the scene doesn't visibly bloom on
    startup, but each with a different amount of life left, since a cohort sharing one birth time
    also dies together and punches a hole in the landscape one lifespan in.
    Each blob's deformation (`phase`) and grow-in/hold/shrink-out envelope
    (`birthTime`, `growDuration`, `shrinkDuration`, `lifespan`) are instead functions of the
    `time` argument passed to `fieldValue`/`isViable` — every one of those fields is fixed once a
    blob exists, so viability queries stay reproducible for a given clock reading, even though
    *which* blobs currently exist is itself state built up by `update()` calls. This is what makes
    shapes form out of nothing and shrink back out of existence, and keeps drift from settling into
    a repeating back-and-forth bounce. Both are measured against the **deform clock** — a
    `deformClock += dt * environmentDeformationSpeed` accumulator, with `birthTime` stored in its
    units and query times mapped through `deformTimeAt()`. Integrating the speed forward matters:
    the earlier version multiplied wall-clock age by the *current* multiplier, so nudging the
    deform-speed slider retroactively rescaled every blob's age (measured: 0.08 → 0.16 mid-run took
    the field from 6 blobs to 1 in a single tick) and snapped every wobble to a new point in its
    cycle. This is the one piece of `update()`-built state the envelope depends on, so it's also
    why the envelope is no longer a *pure* function of the passed `time` alone. `getEnvironmentStats(time)`
    is a separate, cheap, audio-facing summary (`blobCount`/`averageRadius`/`coverageFraction`,
    the last a naive sum-of-blob-areas-over-world-area that doesn't subtract overlap — an
    overestimate when blobs overlap, but fine for a smooth "how alive does the screen feel"
    signal rather than an exact one) — not for visuals, which sample `fieldValue` per-pixel
    instead (see `FitnessPlane.ts`).
  - `Organism.ts` — the `Organism` type and its asynchronous per-organism lifecycle
    (`alive → dying` on leaving a viable region, `alive → bursting → removed` on reaching the
    live `params.burstRadius`, spawning up to `params.offspringCount` mutated offspring).
    `updateOrganism()` mutates the organism in place and *returns* any newly spawned offspring; it
    never appends to a population itself. Each candidate offspring position is rejection-sampled
    (up to `MAX_SPAWN_ATTEMPTS` tries) within `variationRadius` of the parent, requiring at least
    `spawnClearanceFactor * burstRadius` center-to-center distance from every existing organism
    (`neighbors`, passed in by the caller) *and* from this burst's own siblings placed so far — at
    the default factor of 2 this guarantees two fully-grown organisms can never overlap, for
    either one's entire lifetime, not just at the moment of spawning. A child with no clear spot
    after all attempts is simply skipped ("not enough room") rather than placed overlapping, so
    `offspringCount` is a target per burst, not a guarantee, whenever `spawnClearanceFactor > 0`.
    0 disables the check entirely, restoring the original always-place behavior.
  - `Simulation.ts` — owns the organism array and the `Landscape`, steps everything by `dt`,
    and is the *only* place that enforces the population hard-cap and extinction/auto-reseed. It
    passes its own current `organisms` array into `updateOrganism` as the spawn-clearance
    `neighbors` set (so bursts only avoid overlapping organisms that existed *before* this tick —
    two different parents bursting into the same space within one tick can still collide; accepted
    as a rare, low-cost edge case rather than threading a live cross-burst buffer through the loop).
    The cap is enforced *after*
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
    `spawnOrganismAt(x, y)`, `killAll()`, `reset()`, `paused`, `timeScale`, `burstCount`,
    `deadCount`, `runTime`, `timeSinceExtinction`, `burstsThisTick`, `fallsThisTick`) is the only
    thing rendering/UI code may touch.
    `timeScale` (clamped to `[0, MAX_TIME_SCALE]`, default 1) is transport rather than biology — it
    scales how fast the run is *watched*, not how any part of the model behaves relative to any
    other, so it belongs next to `paused` and not in `params`. `update(dt)` advances
    `dt * timeScale` as however many sub-steps of at most `MAX_SUBSTEP_DT` that takes, rather than
    handing one big `dt` to a single step: that's what makes a fast scale a true fast-forward
    (10× for one tick is bit-for-bit identical to 1× for ten) instead of coarsening every tick until
    organisms grow straight past their burst radius. `burstsThisTick`/`fallsThisTick` accumulate
    across those sub-steps, so a caller still hears every event that was simulated.
    `spawnOrganismAt` is `seedPopulation`'s single-point counterpart (e.g. for click-to-spawn): it
    always honors the request, displacing the oldest organism to make room at the population cap
    rather than silently no-oping. `killAll()` marks every organism `dying` rather than clearing
    the array outright, so they fade away through the same removal path (and get counted toward
    `deadCount`) as any other death, just all at once — a quick way to end the current run.
    `burstCount`, `deadCount`, and `runTime` together form a per-run scoreboard: all three read as
    "how has *this* run gone", so all three reset together (see `beginRunIfEmpty()`) the moment a
    new organism appears in an empty population (via `seedPopulation` or `spawnOrganismAt`), not
    just on a full `reset()`. `burstCount` is incremented once per organism on its
    `alive → bursting` transition (checked by comparing state before/after each `updateOrganism()`
    call, not by counting offspring) — a successful pop, regardless of how many children actually
    cleared spawn-placement and got born; staying `bursting` for further ticks while it fades out
    doesn't double-count it. `deadCount` only counts organisms whose `state` was `dying` at
    removal — not `bursting` (that's reproduction, not death) and not organisms evicted purely to
    enforce `maxOrganisms`. `runTime` freezes the instant the population hits zero and restarts
    from 0 on that same next-spawn trigger. `timeSinceExtinction` (a thin getter over the
    pre-existing `extinctionTimer`, also used to gate `autoReseedOnExtinction`) is what `StatsHud`
    uses to delay the "click to add a ball" prompt's fade-in, and what `SpawnBudget` (see
    `src/app/`) uses to time its post-extinction refill. `burstsThisTick`/`fallsThisTick` are a
    different kind of counter — *transient*, overwritten (not accumulated) at the very top of every
    `update()` call (before the `paused` early-return, specifically so a paused tick doesn't leave
    a stale nonzero count sitting there re-triggering the same sound effect every frame) — a caller
    must read them right after calling `update()` to see that tick's events before the next tick
    clears them. `main.ts` is the only reader, calling `Music.playPop()`/`playFall()` once per
    event.

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
    both `three` and `Simulation`'s type. `raycastToTraitSpace(ndcX, ndcY)` casts the fixed
    isometric camera's ray onto the infinite ground plane (not the finite fitness-plane mesh, so a
    click resolves to a trait-space point even far outside `WORLD_SIZE`) — the only Three.js-facing
    API `main.ts` needs for click-to-spawn.

- `src/ui/` — `Controls.ts` is a Tweakpane dev panel grouped into folders (Environment / Organisms
  / Population / Audio) so it's clear what governs the drifting viable regions vs. individual
  organism behavior vs. overall population bookkeeping vs. sound. Global transport controls
  (Play/Pause, Speed, Sound, Reset) sit at the top of the panel, outside any folder — Speed is up
  there with Play/Pause because it's playback (`Simulation.timeScale`), not a tuning knob that
  changes the dynamics like the Environment sliders do; it's also the one slider deliberately *not*
  centered on its default, since 1× is real time and there's nothing slower to offer. "Sound" (not "Mute")
  is deliberately phrased so *checked* means sound is on, avoiding a double-negative checkbox;
  internally it's still `Music.setMuted(!ev.value)`, only the UI-facing sense is inverted. The
  "Audio (temporary)" folder (music/pop/fall volume sliders, each wired straight to
  `Music.set*Volume()`) exists purely so the mix can be tuned live; per the code's own doc comment
  it's meant to collapse into a single "Effects" on/off checkbox later, once levels are settled —
  don't build further on top of it as if it were permanent. `Presets.ts` and `ExplanationOverlay.ts` are
  currently stubs (only a `Default` preset; overlay hidden with no content) — the full preset set
  and explanation-mode captions are deferred. `StatsHud.ts` is a separate, much smaller display
  (the `#stats` element, top-center, outside the Tweakpane panel entirely, its text centered): a
  read-only burst/dead/runTime/spawnsLeft readout, plus a second line below it — a large, glowing,
  slow-fading "Click somewhere to add a ball" prompt meant to dominate the top of the screen and
  read as emerging out of mist (big `clamp()`-sized text, `text-shadow` glow, and a `blur()` →
  sharp `filter` transition alongside the opacity fade). Hidden (`opacity: 0`, blurred) until
  `timeSinceExtinction` clears `PROMPT_DELAY_SECONDS`, then fades in over
  `PROMPT_FADE_DURATION_SECONDS`. The fade's `transition` is set from `StatsHud.ts`'s constructor
  (not `index.html`'s static CSS) specifically so `PROMPT_FADE_COMPLETE_SECONDS` (delay + duration,
  exported from this file) is one single source of truth shared with `SpawnBudget`, rather than
  two independently-tuned durations that could drift out of sync — `index.html` only sets the
  non-timing base styles (font size/color/glow/initial hidden blur). Deliberately its own top-level
  element rather than living inside Controls, since it's meant to always be visible, not tucked
  behind the collapsed panel.

- `src/audio/Music.ts` — all audio, synthesized with the Web Audio API; there's no bundled audio
  asset in this project, so nothing is loaded or fetched. Three independent pieces share one mute
  switch (`masterGain`, a pure on/off value — never the volume itself) but each has its own
  downstream volume bus (`musicVolumeGain`/`popVolumeGain`/`fallVolumeGain`) so muting and
  per-sound-type loudness stay fully decoupled:
  - The ambient pad (`start()`, lazily building the graph — idempotent/safe to call repeatedly,
    since browsers block audio until a user gesture and `main.ts` calls it from a one-time
    `window` `pointerdown` listener rather than tying it to any specific UI element): an
    organ-registration-style chord (`CHORD_INTERVALS`/`SUB_OCTAVE_RATIO` — open fifths/octaves plus
    a 16'-style sub and a 12th/15th "mixture" pair on top, deliberately no third, for an
    archetypal/timeless rather than emotionally major-or-minor feel) of detuned `triangle`-wave
    voice pairs (the sub-octave alone, undetuned — pairing something that low produces a muddy beat
    rather than a chorus shimmer) through a lowpass filter, then split into a dry path and a wet
    path through `createReverbImpulse` (a synthesized, not recorded, cathedral-length impulse
    response — same "no bundled asset" reasoning as the rest of this file) before being summed back
    together — the reverb is the single biggest contributor to the intended grand/spacious feeling.
    `updateEnvironment(stats, maxBlobRadius)`
    (called every frame from `main.ts`, internally throttled to `ENV_UPDATE_INTERVAL_MS` since the
    landscape barely changes faster than that) re-targets three params from
    `Landscape.getEnvironmentStats()` so the pad reflects what's actually on screen:
    `coverageFraction` opens/closes the filter, `blobCount` scales a dedicated `densityGain` node,
    and `averageRadius` (normalized against `viabilityBlobRadiusMax`) shifts the chord's root pitch
    down as shapes get bigger. All three glide via `setTargetAtTime` over `ENV_GLIDE_SECONDS`
    rather than snapping, so the sound drifts rather than visibly tracking the sim tick-by-tick.
  - `playPop()`/`playFall()` — very short, very quiet synthesized blips for an organism
    successfully bursting / starting to fall (leaving a viable region), triggered from `main.ts`
    once per event reported by `Simulation.burstsThisTick`/`fallsThisTick`, each call passed the
    live `simulation.population`. Two independent throttles keep a large population from turning
    into noise: each is capped at `MAX_SFX_VOICES` *concurrent* voices (extra triggers within the
    same brief window are simply skipped), and separately each individual event's own peak volume
    decays — via `sfxVolumeFactor(population, floorFraction)`, `1` (no decay) at population 0 down
    to `floorFraction` of the current slider volume by `SFX_DECAY_POPULATION` (100), curved by
    `SFX_DECAY_EXPONENT` so it stays close to full volume for a "few balls" run and only falls off
    steeply as population climbs — since voice-capping alone only limits how many can sound *at
    once*, not how often new ones fire (a population of hundreds still fires far more pop/fall
    events per second than a population of a few, even with the same cap). `playPop`/`playFall`
    both skip building any audio nodes at all once the decayed peak is near-silent (`<= 0.001`),
    which matters since these are exactly the high-population conditions where nodes would
    otherwise be created most often. Self-cleaning: each voice disconnects itself and decrements
    the active-voice count from its own `onended` handler.
  - Volume/mute setters (`setMuted`, `setMusicVolume`, `setPopVolume`, `setFallVolume`) all follow
    the same pattern: store the value on the instance (so it applies once `start()` eventually
    builds the graph, even if called beforehand) and, if the relevant gain node already exists,
    glide to it via `setTargetAtTime` rather than snapping — avoids audible clicks on a dragged
    slider or a toggled checkbox.

- `src/app/SpawnBudget.ts` — a limited, regenerating resource (`MAX_SPAWNS`, default 3) gating how
  many times the player can click-to-spawn. A pacing/game mechanic layered on top of the
  simulation, not part of the natural-selection model itself — that's why it lives here in
  `src/app/` next to the orchestration code rather than in `src/simulation/` (which is otherwise
  the only directory Vitest covers; this file is manually verified in the browser instead, same as
  the rest of the UI/app layer). Regenerates one every `REGEN_INTERVAL_SECONDS` (30s) while the
  population isn't extinct, capped at `MAX_SPAWNS`; refilled to full the moment
  `timeSinceExtinction` clears `PROMPT_FADE_COMPLETE_SECONDS` (imported from `StatsHud.ts`) — not
  the instant extinction happens, and not tied to whether/when the player next spawns.
  `tryConsume()` is the only way to spend a spawn; it's a no-op returning `false` at zero, which is
  exactly what `main.ts`'s click handler checks to block spawning when the budget is empty.

- `src/app/main.ts` — the only place the per-frame loop is wired:
  `simulation.update(dt) → spawnBudget.update(dt, ...) → music.updateEnvironment(...) →
  music.playPop()/playFall() (once per Simulation.burstsThisTick/fallsThisTick) →
  renderer.sync(simulation) → renderer.render() → controls.update() → statsHud.update(...)`, with
  `dt` clamped to `1/20` so a backgrounded tab doesn't cause a simulation spiral on refocus (the
  `Simulation.timeScale` multiplier is applied *inside* `update()`, after that clamp, as extra
  sub-steps — the frame loop itself stays one `update()` call per frame). `SpawnBudget` is fed
  `dt * simulation.timeScale` rather than raw `dt`, since its other timing input
  (`timeSinceExtinction`) is simulation time and the two would otherwise disagree about how long
  30s is at any speed but 1×. Also wires the click-to-spawn
  interaction: a click on `#scene` first calls `spawnBudget.tryConsume()` (returning early, doing
  nothing, if the budget is empty) and only then is converted to NDC, raycast to a trait-space
  point via `Renderer3D.raycastToTraitSpace`, and handed to `Simulation.spawnOrganismAt(x, y)` — no
  special-casing for out-of-bounds/non-viable clicks beyond that budget check, since
  `spawnOrganismAt` is just `createOrganism` + `push`, so the same lifecycle rules that make any
  other out-of-bounds/non-viable organism fall away apply automatically. This same click path is
  what restarts `runTime`/`burstCount`/`deadCount` after an extinction (see `Simulation.ts` above).

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

Tune landscape density against the **steady state, not the opening frame**. A blob averages ~0.78
of its base radius across its grow/hold/shrink life, and coverage goes as r², so a landscape holding
N blobs settles visibly sparser than N full-size blobs look — the first seconds of a run are the
densest it ever gets, since the initial cohort is seeded full-size. `viabilityBlobCount` is 8
because that's what holds steady-state coverage (`getEnvironmentStats().coverageFraction`) near the
~13% that reads as merged, lava-lamp-ish shapes rather than separated circles; 5 settled near 8.5%.
Note the merged look needs *neighbours to merge with*, so prefer raising the count over
`viabilityBlobRadiusMin/Max` — an isolated blob renders as an exact circle of its own radius
(`r²/d² ≥ 1 ⟺ d ≤ r`), so bigger radii alone just yield bigger circles. A cheap way to measure any
of this: step a bare `Landscape` in a throwaway Vitest file over ~10 minutes across a few seeds and
watch `getEnvironmentStats`, rather than eyeballing a single run.
