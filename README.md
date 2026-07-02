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

Click anywhere in the scene to spawn a single organism there. It follows the exact same rules as
every other organism: if the click lands in a viable region it starts growing; otherwise it falls
away, whether that's a non-viable spot within the fitness space or outside it entirely.

## Controls panel

Every slider's range is centered on its default — the lever sits in the middle of the track
out of the box, left of center is slower/smaller, right of center is faster/bigger.

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
| Max population | hard cap; the oldest organisms are displaced to make room for new offspring |
| Population | live organism count (read-only) |
| Auto-reseed on extinction | if enabled, automatically reseeds the population after it dies out |

## Project status

This is an MVP: the simulation engine, an isometric Three.js renderer, and the dev control panel
above. Not yet built: the full preset system, explanation-mode overlay content, lineage trails,
additional visual presets, image/video export, and accessibility/reduced-motion modes.

See `CLAUDE.md` for architecture notes.
