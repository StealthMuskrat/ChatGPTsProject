# Contributing to the atlas

Keep the observatory easy to enter and easy to understand. A good addition makes a model more explorable, explains an idea clearly, improves accessibility, or preserves a discovery more reliably.

1. Run `npm run check` before and after changes. There is no dependency installation step.
2. Keep simulation logic in `src/engines/`, free of browser APIs. Randomness must be seeded; updates must not depend on render timing.
3. Add tests for model behavior or persistence invariants when they change. Favor recognizable outcomes, such as an oscillator, over tests that duplicate a function’s implementation.
4. Add every exposed parameter to the catalog and validate imported state. Avoid changing the meaning of version 1 snapshots; introduce a new format version and migration if needed.
5. Check desktop and narrow phone layouts, reduced motion, pointer interactions, and keyboard navigation. Keep generated patterns available alongside a text explanation and useful statistics.
6. Attribute established models. Describe simplifications clearly. Don’t turn an exploratory visualization into an unsupported scientific claim.

See `docs/ROADMAP.md` for directions. A new world should bring a distinct idea, a compelling first view, a useful interaction, and an explanation of the rule.
