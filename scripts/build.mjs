import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';

const root = resolve(dirname(fileURLToPath(import.meta.url)),'..');
const dist = resolve(root,'dist');
const pkg = JSON.parse(await readFile(resolve(root,'package.json'),'utf8'));
if (!/^\d+\.\d+\.\d+$/.test(pkg.version)) throw new Error('Release version must be a stable semantic version.');
const revision = process.env.GITHUB_SHA || process.env.ATLAS_SOURCE_REVISION || 'local';
if (revision !== 'local' && !/^[0-9a-f]{40}$/.test(revision)) throw new Error('Invalid source revision.');
let esbuild;
try { esbuild = await import('esbuild'); }
catch { throw new Error('Install build tooling first: npm install --no-save --package-lock=false esbuild@0.25.12'); }

const js = await esbuild.build({
  absWorkingDir:root,entryPoints:['src/app.js'],bundle:true,format:'iife',platform:'browser',
  target:'es2022',minify:true,write:false,legalComments:'none',charset:'utf8',
});
const css = await esbuild.transform(await readFile(resolve(root,'style.css'),'utf8'),{ loader:'css',minify:true,charset:'utf8' });
const icon = await readFile(resolve(root,'favicon.svg'),'utf8');
let html = await readFile(resolve(root,'index.html'),'utf8');
const replacements = [
  ['<link rel="stylesheet" href="./style.css">',`<style>${css.code.replace(/<\/style/gi,'<\\/style')}</style>`],
  ['<script type="module" src="./src/app.js"></script>',`<script defer>${js.outputFiles[0].text.replace(/<\/script/gi,'<\\/script')}</script>`],
  ['href="./favicon.svg"',`href="data:image/svg+xml,${encodeURIComponent(icon)}"`],
  ['class="brand" href="./"','class="brand" href=""'],
];
// An inline classic script must run after the document has been parsed. Unlike
// external scripts, an inline script does not honor defer, so move it to body end.
for (const [needle,replacement] of replacements) {
  if (!html.includes(needle)) throw new Error(`Build input changed; missing ${needle}`);
  html = html.replace(needle,() => replacement);
}
const script = html.match(/<script defer>[\s\S]*?<\/script>/)?.[0];
if (!script) throw new Error('Bundled script missing.');
html = html.replace(script,'').replace('</body>',() => `${script.replace('<script defer>','<script>')}\n</body>`);
html = html.replace('<head>',`<head>\n<!-- Emergence Atlas v${pkg.version}; source ${revision}; esbuild ${esbuild.version} -->`);
if (/<script[^>]+\bsrc=|<link[^>]+rel="stylesheet"|<script[^>]+type="module"/i.test(html)) throw new Error('Standalone build still references separate app assets.');
await mkdir(dist,{ recursive:true });
await writeFile(resolve(dist,'Emergence-Atlas.html'),html);
const license = await readFile(resolve(root,'LICENSE'),'utf8');
await writeFile(resolve(dist,'LICENSE'),license);
const instructions = `# Emergence Atlas v${pkg.version} — Final Edition\n\nExtract the ZIP, then double-click Emergence-Atlas.html in a modern browser.\nNo Node.js, npm, installation, web server, or internet connection is needed to explore.\n\nThree worlds: Chemical gardens, A murmuration, and The living grid.\nCompare two futures, vary one rule, and reveal spatial difference maps.\nSpace pauses; R restarts. Focus a field and press Enter to disturb its center.\n\nKeep moments in the field notebook and export important observations as JSON backups.\nExisting version 1 and version 2 experiment exports can be imported. Browser storage\nfor local files varies by browser and file location; moving or renaming the HTML\nmay give it a different notebook. Storage failures offer a downloadable backup.\n\nRecipe links require an HTTP(S) host to be shared with someone else. For local\nsharing, export a notebook moment. Source/model links are optional internet links.\nTo host the app, upload Emergence-Atlas.html to any static host (it can be renamed\nto index.html). All application assets are embedded in that one file.\n\nSource revision: ${revision}\nSource: https://github.com/StealthMuskrat/ChatGPTsProject\nLicense: MIT (included).\n`;
await writeFile(resolve(dist,'README.txt'),instructions);
const files = {};
for (const name of ['Emergence-Atlas.html','LICENSE','README.txt']) {
  const bytes = await readFile(resolve(dist,name));
  files[name] = { bytes:bytes.length,sha256:createHash('sha256').update(bytes).digest('hex') };
}
await writeFile(resolve(dist,'build-manifest.json'),JSON.stringify({
  name:pkg.name,version:pkg.version,source_revision:revision,builder:`esbuild ${esbuild.version}`,format:'standalone HTML',files,
},null,2)+'\n');
console.log(`Built Emergence Atlas v${pkg.version}: ${files['Emergence-Atlas.html'].bytes.toLocaleString()} bytes, all app assets embedded.`);
