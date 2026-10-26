import assert from 'node:assert/strict';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { validateSnapshot } from '../src/state.js';

const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
const file = new URL('../dist/Emergence-Atlas.html',import.meta.url);
const out = new URL('../test-results/',import.meta.url);
await mkdir(out,{ recursive:true });
const html = await readFile(file,'utf8');
assert.ok(!/<script[^>]+\bsrc=|<link[^>]+rel="stylesheet"|<script[^>]+type="module"/i.test(html));
const manifest = JSON.parse(await readFile(new URL('../dist/build-manifest.json',import.meta.url),'utf8'));
assert.equal(createHash('sha256').update(html).digest('hex'),manifest.files['Emergence-Atlas.html'].sha256);
const browser = await chromium.launch({ headless:true,...(process.env.ATLAS_BROWSER_CHANNEL ? { channel:process.env.ATLAS_BROWSER_CHANNEL } : {}) });
const errors = [], network = [], checks = [];
let page;
try {
  const context = await browser.newContext({ viewport:{ width:1440,height:1000 },reducedMotion:'reduce',acceptDownloads:true });
  await context.route(/^https?:/,route => { network.push(route.request().url()); return route.abort(); });
  page = await context.newPage(); page.on('pageerror',e => errors.push(e.message));
  await page.goto(file.href);
  await page.waitForFunction(() => document.querySelectorAll('#controls .control').length === 3);
  assert.equal(await page.locator('#play').getAttribute('aria-label'),'Play simulation');
  checks.push('standalone file opens directly with reduced motion and no server');

  for (const kind of ['reaction','flock','life']) {
    await page.locator(`[data-world="${kind}"]`).click();
    await page.locator('#compare').click(); await page.locator('#difference-toggle').click();
    await page.locator('#step').click();
    assert.equal(await page.locator('#tick').innerText(),'000001');
    assert.ok(await page.locator('#difference-panel').isVisible());
    await page.locator('#compare').click();
  }
  checks.push('all three compiled worlds, comparisons, and difference maps run offline');

  await page.locator('#save').click();
  assert.equal(await page.locator('#saved-count').innerText(),'1');
  await page.locator('#notebook-open').click();
  const jsonDownload = page.waitForEvent('download');
  await page.getByRole('button',{ name:'Export',exact:true }).click();
  const snapshot = JSON.parse(await readFile(await (await jsonDownload).path(),'utf8'));
  assert.ok(validateSnapshot(snapshot));
  await page.getByRole('button',{ name:'Close notebook' }).click();
  await page.reload();
  await page.waitForFunction(() => document.querySelector('#saved-count').textContent === '1');
  await page.locator('#notebook-open').click(); await page.getByRole('button',{ name:'Restore moment' }).click();
  assert.equal(await page.locator('#world-title').innerText(),'The living grid');
  assert.equal(await page.locator('#tick').innerText(),'000001');
  checks.push('local-file notebook survives reload and exports valid experiments');

  await page.locator('#compare').click(); await page.locator('#difference-toggle').click();
  const pngDownload = page.waitForEvent('download'); await page.locator('#export-difference').click();
  const png = await readFile(await (await pngDownload).path());
  assert.deepEqual([...png.subarray(0,8)],[137,80,78,71,13,10,26,10]);
  assert.equal(png.readUInt32BE(16),960); assert.equal(png.readUInt32BE(20),768);
  await page.locator('#share').click();
  assert.match(await page.locator('#toast').innerText(),/local file/);
  checks.push('compiled PNG export works and local recipe sharing gives useful instructions');

  await page.setViewportSize({ width:390,height:844 });
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
  await page.screenshot({ path:fileURLToPath(new URL('standalone-phone.png',out)),fullPage:true,style:'#toast{visibility:hidden!important}' });
  assert.deepEqual(network,[],'standalone app requested a remote asset');
  assert.deepEqual(errors,[]);
  checks.push('compiled phone layout fits and every app asset works without network access');
  await writeFile(new URL('release-check.json',out),JSON.stringify({ status:'passed',version:manifest.version,browser:browser.version(),checks,errors,network },null,2));
  console.log(`${checks.length} standalone release checks passed; no network requests.`);
} catch (e) {
  await page?.screenshot({ path:fileURLToPath(new URL('standalone-failure.png',out)),fullPage:true }).catch(() => {});
  await writeFile(new URL('release-check.json',out),JSON.stringify({ status:'failed',checks,errors,network,failure:e.stack },null,2));
  throw e;
} finally { await browser.close(); }
