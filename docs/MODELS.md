# Notes from inside the field

## Chemical gardens

The 192 × 128 field stores concentrations `u` and `v` in `Float32Array`s. Each tick uses forward Euler integration with `dt = 1`:

```text
du = ∇²u − uv² + feed × (1 − u)
dv = diffusion × ∇²v + uv² − (feed + kill) × v
```

The Laplacian uses a nine-point stencil: center −1, cardinal neighbors 0.2, diagonal neighbors 0.05. Diffusion for `u` is fixed at 1. Concentrations are clamped to [0, 1]; this is a visualization-oriented numerical safeguard, not a claim of exact physical integration. All reads come from the previous arrays and all writes go into separate arrays before swapping.

Seeded circular deposits begin in a field of `u = 1`, `v = 0`. The constructor takes 480 warm-up ticks to reveal a readable pattern. The interface’s tick zero refers to the field **after this warm-up**. Brushing sets `u = 0.45`, `v = 0.6` in a radius of five cells. Color maps the concentration of `v`; it is not temperature or biomass.

At normal tempo the scheduler requests 180 chemical ticks per second. Very slow devices may run slower rather than attempt an unbounded catch-up. Some parameter combinations erase the pattern; that is an outcome of the model, not necessarily a malfunction. Restart or try a preset to regrow the field.

## A murmuration

Two hundred agents occupy a wrapping 960 × 640 world. Every agent reads the previous population. Neighbors within the perception radius contribute average velocity (alignment), mean shortest displacement (cohesion), and inverse-distance repulsion within 24 units (separation). Weighted steering is capped per axis; the result is normalized to the selected flight speed. The optional pointer target adds attraction using the shortest wrapping displacement.

This is a two-dimensional interpretation of Boids with an omnidirectional neighborhood. It does not implement Reynolds’s original full model, predictive obstacle avoidance, or bird flight physics. Neighbor search is quadratic, appropriate to the fixed small population. A snapshot stores positions and velocities; the temporary held pointer is deliberately released when restoring.

The “Moving in unison” statistic is the magnitude of the mean unit velocity, expressed as a percentage. Opposing groups can produce a low global value even when each group is locally well organized. The normal tempo is 60 flock ticks per second.

## The living grid

The 144 × 96 grid uses the eight-cell Moore neighborhood and simultaneous updates. A dead cell is born at exactly `birth` neighbors; a living cell survives within the inclusive `surviveMin` to `surviveMax` interval. The UI keeps the interval ordered. Conway is B3/S23, Coral is B3/S45678, and Maze is B3/S12345.

Values are zero for dead cells and the cell’s age for living ones. Ages saturate at 255, which affects brightness and the reported mean age but not the rule. Initial density only affects the random initial grid; committing a density adjustment starts a new grid. The normal tempo is 30 generations per second. A brush activates a disk of radius two cells.

## Reproducibility and time

Mulberry32 supplies seeded randomness. Engines use no randomness after initialization. A tick is a model update, not wall-clock time. Tempo changes the number of requested updates, not their equations. The scheduler uses a bounded accumulator, pauses work while the document is hidden, and drops excessive wall-clock lag.

The same recipe and ordered interactions repeat in the same application version and JavaScript environment. Floating-point math, especially trigonometry in flock initialization, can differ slightly across engines; universal bit-identical long-term trajectories are not promised. JSON snapshots preserve current numeric state and resume it in the receiving environment. Tests verify exact continuation within the test environment.

Changing a parameter live does not rewind the field. A shared recipe starts again under the **current** parameters. It omits earlier edits and brush strokes. Exported moments store the field, tick, seed, and current parameters, not the history of how that field was reached. Rendering is stateless, so restored images do not depend on an unsaved trail buffer.

## Two futures

Comparison begins from an exact clone of the current state, including existing chemical concentrations, living-cell ages, or traveler velocities. Each engine has independent arrays and parameter objects. A keeps its parameters; B changes one selected live rule. Starting density is excluded. If a survival endpoint is varied, its slider is bounded by the other fixed endpoint so a second rule never changes implicitly.

Both engines receive the same number of ticks and the same normalized brush positions, including interpolated pointer strokes and keyboard input. Temporary flock targets are released for both together. A comparison starts paused. Reset restores the exact shared fork and its tick, retaining B’s current selected value. Selecting another rule starts that new question from the original fork, with every other rule restored to A’s settings.

The concentration statistic is the mean absolute difference in `v` over all sites (range 0–1). Life disagreement is the percentage of sites with different alive/dead occupancy, excluding age. Flock separation averages shortest toroidal distances between agents with the same index; one unit is a simulation coordinate, not a screen pixel. It does not match agents by nearest neighbor. Zero positional or occupancy difference does not imply every component of the states is equal: chemical `u`, cell ages, or traveler velocities may already differ.

These statistics are descriptive model comparisons. A rule change need not create immediate visible divergence. Live slider edits create a history of interventions; that history is not recorded. Recipe links therefore reproduce a seeded common beginning under the currently selected settings, while exact paired snapshots preserve the current fields and their original reset point.

## Persistence formats

Version 1 snapshots contain `version`, `kind`, `seed`, `params`, `tick`, and `data`. Grid dimensions and flock population are fixed by the version. Imports reject unknown versions and worlds, missing/out-of-range or off-step parameters, invalid seeds or ticks, incorrect array lengths, and non-finite or out-of-range cell/agent data. Files are size-checked before parsing. No imported value is inserted as HTML or executed.

Version 2 is a comparison envelope containing `version: 2`, `mode: "comparison"`, `kind`, `seed`, `tick`, `parameter`, and three parts: `origin`, `baseline`, `variant`. Each part has `tick`, `params`, `encoding`, and `data`. Reaction fields encode their already-Float32 `u` and `v` values as explicitly little-endian Float32 bytes in base64. Life encodes Uint8 ages in base64. Flock parts use `agents` encoding with numeric traveler objects. These encodings are lossless for the actual engine state; no concentration or age is rounded for storage.

The decoder checks the expected encoding, exact base64 length and character set, decoded byte count, and every decoded numeric value. It validates each field using the version 1 state invariants. All parts inherit the envelope’s world and seed. The two current ticks must equal the envelope tick; the origin cannot be in their future. A’s parameters must match the origin, and B can differ only at the selected live rule. Version 1 exports and the existing notebook storage key keep their original meaning.

Restoration allocates engine buffers without rerunning random seeding or the chemical warm-up, then fills every state array from the validated snapshot. Subsequent ticks still write all scratch-buffer cells before swapping. Imports are capped at 8 MB. Compact encoding helps paired chemical moments fit browser storage, but mixed or large notebooks can still reach the browser’s quota; failed saves fall back to a downloadable export.

Notebook persistence is browser-local and synchronous. It is best for a few observations, not a large archive. JSON exports are the portable backup. Nothing is uploaded by the app.
