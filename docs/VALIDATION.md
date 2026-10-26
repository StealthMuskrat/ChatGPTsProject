# Validating the observatory

The first edition passed all 15 Node checks on Node 22 and 24 and all 11 Chromium browser scenarios in [this GitHub Actions run](https://github.com/StealthMuskrat/ChatGPTsProject/actions/runs/40328239037). Its desktop, phone, and notebook screenshots were visually reviewed; the original [observatory preview](observatory.webp) comes from that run.

Edition 002 passed **24 model/server tests** on Node 22 and 24 and **16 browser scenarios** in [this GitHub Actions run](https://github.com/StealthMuskrat/ChatGPTsProject/actions/runs/40331855807). Its desktop and phone comparison screenshots were visually reviewed. The README comparison preview comes from that run. Added checks cover exact and independent forks, synchronized input, one-rule divergence, reset to the shared origin, paired recipe links, lossless binary grid encoding, exact continuation of both futures, malformed pair rejection, coexistence with legacy notebook moments, labeled paired PNGs, and comparison layouts from 320 to 1440 pixels wide. Later runs in the Actions tab describe the current commit.

## Model and persistence checks

Edition 003 passed **29 model/server tests** on Node 22 and 24 and **20 browser scenarios** in [this GitHub Actions run](https://github.com/StealthMuskrat/ChatGPTsProject/actions/runs/40338224345), using Chrome 155.0.8059.39. Chemical, traveler, and phone cell-map screenshots were visually reviewed; the README’s completed-observatory preview comes from this run. Map checks cover absolute concentration differences, four exact occupancy classes, traveler identity and both wrapping seams, fixed color limits, non-mutating contrast changes, zero maps for identical chemical fields, labeled PNG dimensions, reconstruction after paired restoration, and responsive map layouts. Later runs in the Actions tab record the current commit.

Run `npm run check` with Node.js 22 or newer. This checks the application and renderer syntax, then runs the Node test suite without third-party packages. CI runs it on Node 22 and 24.

Fifteen regression tests cover seeded randomness, toroidal geometry, finite reaction fields across presets, known Conway patterns, simultaneous flock updates, agent bounds and speeds, malformed recipes, snapshot validation, independent saved arrays, identical continuation after JSON transport, and development-server behavior.

## Browser checks

The separate browser job installs Playwright 1.58.2 as temporary development tooling and uses Google Chrome already installed on GitHub’s Ubuntu runner, avoiding repeated operating-system package updates. Its report records the actual browser version and channel. Browser checks have a ten-minute job limit, and new commits cancel superseded checks in the same workflow group.

To run locally with Playwright’s bundled Chromium:

```sh
npm install --no-save --package-lock=false playwright@1.58.2
npx playwright install --with-deps chromium
npm run test:browser
```

To use an existing Chrome installation instead, set `ATLAS_BROWSER_CHANNEL=chrome` when running `npm run test:browser`; the Playwright browser installation step is then unnecessary.

The script starts its own local server on port 3099 and checks the interface using Chromium. It exercises reduced motion, rendering, single stepping, exact visual restoration, JSON and PNG downloads, validated imports, drawing, keyboard shortcuts, presets, survival controls, density restarts, recipe sharing, persistence after reload, phone overflow, storage failure, and invalid links. It writes screenshots and a machine-readable report into `test-results/`, uploaded by CI as the `observatory-browser-check` artifact. An unhandled browser exception or failed local asset request fails the check.

The Node checks do not require a browser. A missing browser installation prevents the browser script from running and should not be reported as a passing check. Test results are available in the repository’s **Actions** tab. Chromium automation is not a substitute for manual checks in Safari, Firefox, or on physical touch devices.

## Compiled release checks

[v1.2.0](https://github.com/StealthMuskrat/ChatGPTsProject/releases/tag/v1.2.0) was published from source commit `becdedb0da5cddad0c82bea4946e732432e2d7bc` after [this release workflow](https://github.com/StealthMuskrat/ChatGPTsProject/actions/runs/40409842994) passed all 29 model/server tests, 20 source browser scenarios, and five standalone checks in Chrome 155.0.8059.39. The compiled file made no HTTP(S) requests during its offline checks. Its phone screenshot was visually reviewed. The published ZIP, HTML, and manifest checksums were verified against the tested artifacts.

The final-release workflow compiles the source modules with esbuild 0.25.12 into one HTML file, embedding the CSS and SVG icon. It runs the existing model and browser suites, then five additional scenarios against the compiled file opened directly with `file://`, with HTTP(S) asset requests blocked. These exercise all three worlds, comparisons and maps, local notebook persistence and JSON export, compiled PNG export, local sharing guidance, and phone layout. The report includes the browser version and any unexpected network requests.

The package script verifies the manifest, creates a ZIP with fixed file order/timestamps/permissions, checks every archived file against the tested build, and writes SHA-256 checksums. The workflow creates a draft release, downloads the uploaded assets again, verifies their checksums, and only then publishes it. Existing release tags and assets are never overwritten automatically. A manual rerun is available through the **Build and publish final release** workflow after a future version is prepared.

## Manual review

- Try all three worlds with pointer and keyboard; pause and restart at different tempos.
- Confirm field explanations match what the controls do.
- Save, export, reload, import, restore, and continue a moment. Compare restored images and future behavior.
- Try a narrow phone viewport and a desktop; inspect dialogs, focus indicators, and slider labels.
- Check reduced motion and navigation using Tab, Shift+Tab, Enter, Space, and Escape.
- Disable storage, deny clipboard access, and import malformed or oversized JSON. Exploration should remain available.
- Serve from a path such as `/ChatGPTsProject/` before moving to a host with a repository base path.
