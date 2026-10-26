# Validating the observatory

## Model and persistence checks

Run `npm run check` with Node.js 22 or newer. This checks the application and renderer syntax, then runs the Node test suite without third-party packages. CI runs it on Node 22 and 24.

Fourteen regression tests cover seeded randomness, toroidal geometry, finite reaction fields across presets, known Conway patterns, simultaneous flock updates, agent bounds and speeds, malformed recipes, snapshot validation, independent saved arrays, and identical continuation after JSON transport.

## Browser checks

The separate browser job installs Playwright 1.58.2 as temporary development tooling and runs:

```sh
npm install --no-save --package-lock=false playwright@1.58.2
npx playwright install --with-deps chromium
npm run test:browser
```

The script starts its own local server on port 3099 and checks the interface using Chromium. It exercises reduced motion, rendering, single stepping, exact visual restoration, JSON and PNG downloads, validated imports, drawing, keyboard shortcuts, presets, survival controls, density restarts, recipe sharing, persistence after reload, phone overflow, storage failure, and invalid links. It writes screenshots and a machine-readable report into `test-results/`, uploaded by CI as the `observatory-browser-check` artifact. An unhandled browser exception or failed local asset request fails the check.

The Node checks do not require a browser. A missing browser installation prevents the browser script from running and should not be reported as a passing check. Test results are available in the repository’s **Actions** tab. Chromium automation is not a substitute for manual checks in Safari, Firefox, or on physical touch devices.

## Manual review

- Try all three worlds with pointer and keyboard; pause and restart at different tempos.
- Confirm field explanations match what the controls do.
- Save, export, reload, import, restore, and continue a moment. Compare restored images and future behavior.
- Try a narrow phone viewport and a desktop; inspect dialogs, focus indicators, and slider labels.
- Check reduced motion and navigation using Tab, Shift+Tab, Enter, Space, and Escape.
- Disable storage, deny clipboard access, and import malformed or oversized JSON. Exploration should remain available.
- Serve from a path such as `/ChatGPTsProject/` before moving to a host with a repository base path.
