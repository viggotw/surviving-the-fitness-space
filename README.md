# surviving-the-fitness-space

*Selection Without Searching*

A browser-based visualization of natural selection as a continuous, non-directed process.
Organisms (simple spheres) grow, burst into mutated offspring near their parent, and disappear
when the drifting "viable region" beneath them moves away. There's no goal, no optimizer, and no
synchronized generational update — only reproduction, heritable variation, environmental drift,
and filtering.

Each organism's color comes from a heritable hue, assigned randomly when a lineage begins and
passed to offspring with a small mutation each generation, so color tracks family lineage rather
than health, fitness, or age.

## Running it

```
npm install
npm run dev       # start the dev server
npm test          # run the simulation unit tests
npm run build     # production build
```

## Interacting with the scene

Click anywhere in the scene to spawn a single organism there — as long as you have spawns left
(see below). It follows the exact same rules as every other organism: if the click lands in a
viable region it starts growing; otherwise it falls away, whether that's a non-viable spot within
the fitness space or outside it entirely. Clicking while the population is extinct also starts a
new run, resetting Popped/Dead/Time (see below).

A centered readout at the top of the screen tracks the current run: **Popped**, organisms that
have successfully burst into offspring (not organisms merely created, and not organisms that died
instead); **Dead**, organisms that died from leaving a viable region (not from successfully
bursting); **Time**, how long the current run has lasted; and **Spawns**, how many clicks you have
left. Popped/Dead/Time freeze the instant the population hits zero and reset together the moment a
new organism appears — from a click, the Reset button, or auto-reseed.

You start with 3 spawns. They regenerate one every 30 seconds while the population isn't extinct
(capped at 3), and refill to 3 the moment the prompt below finishes fading in after an extinction.
Clicking with none left does nothing.

Once the population goes extinct, after a couple of seconds a large "Click somewhere to add a
ball" prompt slowly fades into view at the top of the screen — like it's emerging out of mist —
and disappears the instant it isn't extinct anymore.

A generative ambient soundtrack (synthesized in the browser — no audio file to load) starts on
your first click or tap anywhere on the page: an organ-like, reverb-drenched open chord meant to
feel grand and a little eternal, that continuously reflects the current viable regions — more/
bigger shapes open up the tone and add fullness, bigger shapes in particular pull the pitch down
into something deeper. Organisms bursting and falling each get their own very quiet
sound effect too, both capped so a cluster of many at once still reads as a soft shimmer rather
than noise, and both fading out further still as the population grows past a few dozen so a run of
hundreds doesn't turn into a wall of clicks. Turn it off from the Controls panel at any time.

## Controls panel

Every slider's range is centered on its default — the lever sits in the middle of the track
out of the box, left of center is slower/smaller, right of center is faster/bigger.

Play/Pause, Sound, and Reset sit at the top of the panel, outside any folder — Sound is checked
when audio is on (not a "Mute" checkbox you have to double-negative your way through).

**Environment** — governs the slow-moving, deforming viable regions (the "lava-lamp" pattern):

| Control | Unit |
|---|---|
| Drift speed | multiplier on how fast regions move |
| Deform speed | multiplier on how fast regions pulse/deform, and on how fast regions themselves form and dissolve |
| Deform strength | multiplier on how much regions pulse/deform |
| Edge fading | width of the interior band, near a region's edge, over which the floor dims and organism growth throttles toward zero; 0 (default) is a hard binary edge with no interior throttling |

**Organisms** — governs individual growth and reproduction. Sizes are shown as a percentage of
the fitness space's half-width, not raw trait-space units, so they read as "how big relative to
the play area" instead of tiny decimals. Growth rate, birth radius, and burst radius are shared
and deterministic — every organism starts at the exact same size and grows at the exact same rate
to the exact same size before bursting, not a per-organism trait:

| Control | Unit |
|---|---|
| Growth rate | % of the fitness space's half-width, per second |
| Birth radius | % of the fitness space's half-width; every organism's starting size at spawn |
| Burst radius | % of the fitness space's half-width; the predefined size every organism grows to before bursting |
| Spawn delay, max | seconds; each organism waits a random delay in `[0, this]` after spawning before it starts growing — the only source of randomness in growth timing, kept small enough to just break lockstep between same-tick cohorts without visibly staggering growth |
| Variation radius | % of the fitness space's half-width; max distance offspring spawn from their parent |
| Offspring count | target number of children produced on every burst — see Spawn clearance below for when fewer are actually placed |
| Spawn clearance | multiplier on burst radius; minimum center-to-center distance a new child must keep from every existing organism. 2 (default) guarantees two fully-grown organisms can never overlap; a child with no clear spot after several tries is skipped rather than placed overlapping. 0 disables the check |

**Population** — seeding and headcount bookkeeping:

| Control | Unit |
|---|---|
| Seed count / Seed population | organisms to add on demand |
| Kill all | fades out every current organism (like any other death) — a quick way to end the run before starting a new one |
| Max population | hard cap; the oldest organisms are displaced to make room for new offspring |
| Population | live organism count (read-only) |
| Auto-reseed on extinction | if enabled, automatically reseeds the population after it dies out |

**Audio (temporary)** — per-sound volume, for tuning the mix live. This folder is a stand-in for a
single future "Effects" on/off checkbox, not a permanent set of controls:

| Control | Unit |
|---|---|
| Music volume | gain of the ambient pad |
| Pop volume | gain of the (very quiet) organism-bursting sound effect |
| Fall volume | gain of the (very quiet) organism-falling sound effect |

## Project status

This is an MVP: the simulation engine, an isometric Three.js renderer, and the dev control panel
above. Not yet built: the full preset system, explanation-mode overlay content, lineage trails,
additional visual presets, image/video export, and accessibility/reduced-motion modes.

See `CLAUDE.md` for architecture notes.
