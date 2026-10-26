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

## Persistence format

Version 1 snapshots contain `version`, `kind`, `seed`, `params`, `tick`, and `data`. Grid dimensions and flock population are fixed by the version. Imports reject unknown versions and worlds, missing/out-of-range or off-step parameters, invalid seeds or ticks, incorrect array lengths, and non-finite or out-of-range cell/agent data. Files are size-checked before parsing. No imported value is inserted as HTML or executed.

Notebook persistence is browser-local and synchronous. It is best for a few observations, not a large archive. JSON exports are the portable backup. Nothing is uploaded by the app.
