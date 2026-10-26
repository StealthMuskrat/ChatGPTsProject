# Validating the observatory

The first edition passed all 15 Node checks on Node 22 and 24 and all 11 Chromium browser scenarios in [this GitHub Actions run](https://github.com/StealthMuskrat/ChatGPTsProject/actions/runs/40328239037). Its desktop, phone, and notebook screenshots were visually reviewed; the original [observatory preview](observatory.webp) comes from that run.

Edition 002 passed **24 model/server tests** on Node 22 and 24 and **16 browser scenarios** in [this GitHub Actions run](https://github.com/StealthMuskrat/ChatGPTsProject/actions/runs/40331855807). Its desktop and phone comparison screenshots were visually reviewed. The README comparison preview comes from that run. Added checks cover exact and independent forks, synchronized input, one-rule divergence, reset to the shared origin, paired recipe links, lossless binary grid encoding, exact continuation of both futures, malformed pair rejection, coexistence with legacy notebook moments, labeled paired PNGs, and comparison layouts from 320 to 1440 pixels wide. Later runs in the Actions tab describe the current commit.

## Model and persistence checks

Edition 003 expands the suite to **29 model/server tests** and **20 Chromium scenarios**. Map checks cover absolute concentration differences, four exact occupancy classes, traveler identity and both wrapping seams, fixed color limits, non-mutating contrast changes, zero maps for identical chemical fields, labeled PNG dimensions, reconstruction after paired restoration, and responsive map layouts. The Actions tab records results for each commit.

Run `npm run check` with Node.js 22 or newer. This checks the application and renderer syntax, then runs the Node test suite without third-party packages. CI runs it on Node 22 and 24.

Fifteen regression tests cover seeded randomness, toroidal geometry, finite reaction fields across presets, known Conway patterns, simultaneous flock updates, agent bounds and speeds, malformed recipes, snapshot validation, independent saved arrays, identical continuation after JSON transport, and development-server behavior.

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
