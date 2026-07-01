# surviving-the-fitness-space

*Selection Without Searching*

A browser-based visualization of natural selection as a continuous, non-directed process.
Organisms (simple spheres) grow, burst into mutated offspring near their parent, and disappear
when the drifting "viable region" beneath them moves away. There's no goal, no optimizer, and no
synchronized generational update — only reproduction, heritable variation, environmental drift,
and filtering.

## Running it

```
npm install
npm run dev       # start the dev server
npm test          # run the simulation unit tests
npm run build     # production build
```

## Controls panel

**Environment** — governs the slow-moving, deforming viable regions (the "lava-lamp" pattern):

| Control | Unit |
|---|---|
| Drift speed | multiplier on how fast regions move |
| Deform speed | multiplier on how fast regions pulse/deform |
| Deform strength | multiplier on how much regions pulse/deform |

**Organisms** — governs individual growth and reproduction:

| Control | Unit |
|---|---|
| Growth rate | trait-space units of radius per second |
| Burst radius | trait-space units; the predefined size every organism grows to before bursting |
| Variation radius | trait-space units; max distance offspring spawn from their parent |
| Offspring count | exact number of children produced on every burst |

**Population** — seeding and headcount bookkeeping:

| Control | Unit |
|---|---|
| Seed count / Seed population | organisms to add on demand |
| Max population | hard cap; the oldest organisms are displaced to make room for new offspring |
| Population | live organism count (read-only) |

## Project status

This is an MVP: the simulation engine, an isometric Three.js renderer, and the dev control panel
above. Not yet built: the full preset system, explanation-mode overlay content, lineage trails,
additional visual presets, image/video export, and accessibility/reduced-motion modes.

See `CLAUDE.md` for architecture notes.
