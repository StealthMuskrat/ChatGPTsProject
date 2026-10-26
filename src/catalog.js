export const catalog = {
  reaction: {
    number: '01', name: 'Chemical gardens', family: 'REACTION · DIFFUSION',
    subtitle: 'Two chemicals. A thousand possible worlds.',
    description: 'A substance feeds another, which consumes it. Both spread into their surroundings. From that small feedback loop, islands, fingerprints, and living-looking borders appear.',
    interaction: 'Draw on the field to add the second chemical.',
    question: 'What happens when you feed a pattern just a little faster?',
    equation: '∂u/∂t = Dᵤ∇²u − uv² + f(1 − u)\n∂v/∂t = Dᵥ∇²v + uv² − (f + k)v',
    note: 'Gray–Scott reaction–diffusion model. An illustrative numerical simulation, not a model of a specific organism. The field wraps at its edges.',
    source: 'https://groups.csail.mit.edu/mac/projects/amorphous/GrayScott/',
    sourceLabel: 'Explore the Gray–Scott model',
    controls: [
      { key: 'feed', label: 'Feed rate', min: .01, max: .08, step: .001, value: .037 },
      { key: 'kill', label: 'Removal rate', min: .035, max: .075, step: .001, value: .06 },
      { key: 'diffusion', label: 'Spread of chemical v', min: .2, max: .7, step: .01, value: .5 },
    ],
    presets: [
      { name: 'Tidal lace', hint: 'Branching coastlines', params: { feed: .037, kill: .06, diffusion: .5 } },
      { name: 'Mitosis', hint: 'Islands that divide', params: { feed: .036, kill: .065, diffusion: .5 } },
      { name: 'Fingerprints', hint: 'Winding parallel ridges', params: { feed: .055, kill: .062, diffusion: .5 } },
    ],
  },
  flock: {
    number: '02', name: 'A murmuration', family: 'COLLECTIVE · MOTION',
    subtitle: 'No leader. Just neighbors.',
    description: 'Each traveler follows three local instincts: avoid collisions, match nearby motion, and stay close to the group. A flock forms without anyone directing the whole.',
    interaction: 'Hold on the field to gently attract the flock.',
    question: 'When does a crowd begin to move as one?',
    equation: 'steering = separation + alignment + cohesion\nposition(t + 1) = position(t) + velocity(t + 1)',
    note: 'An interpretation of Craig Reynolds’s Boids. Neighbors are measured on a wrapping world; motion is a discrete steering model, not a physical bird simulation.',
    source: 'https://www.red3d.com/cwr/boids/', sourceLabel: 'Read about the original Boids',
    controls: [
      { key: 'separation', label: 'Personal space', min: 0, max: 3, step: .1, value: 1.5 },
      { key: 'alignment', label: 'Move together', min: 0, max: 3, step: .1, value: 1.2 },
      { key: 'cohesion', label: 'Stay together', min: 0, max: 3, step: .1, value: .8 },
      { key: 'speed', label: 'Flight speed', min: .5, max: 5, step: .1, value: 2.8 },
      { key: 'perception', label: 'Neighbor distance', min: 25, max: 140, step: 1, value: 75 },
    ],
    presets: [
      { name: 'Murmuration', hint: 'A quiet choreography', params: { separation: 1.5, alignment: 1.2, cohesion: .8, speed: 2.8, perception: 75 } },
      { name: 'Wanderers', hint: 'A little independence', params: { separation: 2.3, alignment: .2, cohesion: .2, speed: 2, perception: 45 } },
      { name: 'Slipstream', hint: 'Fast, close, connected', params: { separation: .8, alignment: 2.5, cohesion: 1.3, speed: 4, perception: 100 } },
    ],
  },
  life: {
    number: '03', name: 'The living grid', family: 'CELLULAR · AUTOMATA',
    subtitle: 'A universe made of yes and no.',
    description: 'Every cell sees only its eight nearest neighbors. A few rules decide which cells survive and which are born. The result can be a quiet garden, a moving machine, or a field of restless growth.',
    interaction: 'Draw on the field to bring cells to life.',
    question: 'How much complexity can a single rule hold?',
    equation: 'dead + exactly B neighbors → born\nalive + Smin…Smax neighbors → survives',
    note: 'A family of outer-totalistic cellular automata. The Conway preset uses B3/S23. Cells update simultaneously on a toroidal grid; brighter cells are older.',
    source: 'https://conwaylife.com/wiki/Conway%27s_Game_of_Life', sourceLabel: 'Explore Conway’s Game of Life',
    controls: [
      { key: 'birth', label: 'Neighbors for birth', min: 1, max: 8, step: 1, value: 3 },
      { key: 'surviveMin', label: 'Survive with at least', min: 0, max: 8, step: 1, value: 2 },
      { key: 'surviveMax', label: 'Survive with at most', min: 0, max: 8, step: 1, value: 3 },
      { key: 'density', label: 'Starting density', min: .05, max: .65, step: .01, value: .25, restart: true },
    ],
    presets: [
      { name: 'Conway', hint: 'The classic living universe', params: { birth: 3, surviveMin: 2, surviveMax: 3, density: .25 } },
      { name: 'Coral', hint: 'Slow-growing stone gardens', params: { birth: 3, surviveMin: 4, surviveMax: 8, density: .4 } },
      { name: 'Maze', hint: 'A labyrinth from noise', params: { birth: 3, surviveMin: 1, surviveMax: 5, density: .3 } },
    ],
  },
};

export function defaults(kind) {
  return Object.fromEntries(catalog[kind].controls.map(c => [c.key, c.value]));
}

export function validParams(kind, params) {
  if (!Object.hasOwn(catalog, kind) || !params || typeof params !== 'object' || Array.isArray(params)) return false;
  return Object.keys(params).length === catalog[kind].controls.length && catalog[kind].controls.every(c => {
    const v = params[c.key];
    return typeof v === 'number' && Number.isFinite(v) && v >= c.min && v <= c.max &&
      Math.abs((v - c.min) / c.step - Math.round((v - c.min) / c.step)) < 1e-6;
  });
}
