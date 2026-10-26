# Emergence Atlas v1.2.0 — Final Edition

A complete observatory for emergent worlds, now available as a compiled, standalone app.

## Download and open

Download **Emergence-Atlas-v1.2.0.zip**, extract it, and double-click **Emergence-Atlas.html**. You can also download the HTML asset directly. No Node.js, npm, installation, server, or internet connection is needed to explore. Use a modern browser.

## Included

- Chemical gardens, flocking, and cellular life, with nine presets and seeded experiments.
- Exact two-future forks with one varied rule, synchronized time and drawing, and divergence statistics.
- Spatial difference maps with labeled contrast or occupancy keys.
- A field notebook, portable version 1/2 JSON moments, recipe links when hosted, and PNG exports.
- Responsive controls, keyboard interaction, and reduced-motion support.

## Files and verification

The ZIP includes the standalone HTML, opening instructions, MIT license, and build manifest. **SHA256SUMS.txt** contains checksums for the ZIP, HTML, and manifest. The manifest records the exact source commit and esbuild version.

The release workflow runs the 29 model/server tests, all 20 browser scenarios, and five additional checks against the compiled HTML opened directly as a local file with network requests blocked. The ZIP is validated, uploaded assets are downloaded and checksum-verified, and the draft is then published.

Browser-local notebook storage may vary for local files or after moving/renaming the HTML. Export important moments as JSON backups. To share from an offline copy, export a notebook moment; portable recipe URLs require hosting the HTML over HTTP(S). The source repository remains available for development and static hosting.
