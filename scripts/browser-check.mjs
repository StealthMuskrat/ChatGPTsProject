import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { validateSnapshot } from '../src/state.js';

// Optional development tooling only. The observatory itself needs no packages.
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
const root = fileURLToPath(new URL('..',import.meta.url));
const out = new URL('../test-results/',import.meta.url);
await mkdir(out,{ recursive:true });
const port = process.env.ATLAS_TEST_PORT || '3099';
const origin = `http://127.0.0.1:${port}`;
const server = spawn(process.execPath,['scripts/serve.js'],{ cwd:root,env:{ ...process.env,PORT:port },stdio:'pipe' });
let serverLog = '';
server.stderr.on('data', d => { serverLog += d; });
const results = [], errors = [];
let browser, page, activePage;
async function check(name,fn) { await fn(); results.push(name); console.log(`✓ ${name}`); }
async function noOverflow(p) {
  const overflow = await p.evaluate(() => ({
    width:innerWidth,scroll:document.documentElement.scrollWidth,
    elements:[...document.body.querySelectorAll('*')].filter(el => {
      const r = el.getBoundingClientRect(); return r.width > 0 && r.right > innerWidth+1;
    }).slice(0,12).map(el => ({ tag:el.tagName,id:el.id,class:el.className,right:el.getBoundingClientRect().right })),
  }));
  assert.ok(overflow.scroll <= overflow.width,`horizontal overflow: ${JSON.stringify(overflow)}`);
}
async function screenshot(p,name) {
  await p.screenshot({ path:fileURLToPath(new URL(name,out)),fullPage:true,
    style:name === 'failure.png' ? undefined : '#toast { visibility:hidden !important; }' });
}

try {
  let ready = false;
  for (let i = 0; i < 60; i++) {
    try { if ((await fetch(origin)).ok) { ready = true; break; } } catch { /* Server is starting. */ }
    await new Promise(r => setTimeout(r,100));
  }
  assert.ok(ready,`Server failed to start: ${serverLog}`);
  browser = await chromium.launch({ headless:true,...(process.env.ATLAS_BROWSER_CHANNEL ? { channel:process.env.ATLAS_BROWSER_CHANNEL } : {}) });
  const context = await browser.newContext({ viewport:{ width:1440,height:1100 },reducedMotion:'reduce',acceptDownloads:true,permissions:['clipboard-read','clipboard-write'] });
  page = await context.newPage();
  activePage = page;
  context.on('page', p => p.on('pageerror',e => errors.push(e.message)));
  page.on('pageerror',e => errors.push(e.message));
  page.on('response',r => { if (r.status() >= 400) errors.push(`${r.status()} ${r.url()}`); });
  await page.goto(origin);
  await page.waitForFunction(() => document.querySelectorAll('#controls .control').length === 3);

  await check('reduced motion starts paused and the first field contains a real pattern',async () => {
    assert.equal(await page.locator('#play').getAttribute('aria-label'),'Play simulation');
    assert.equal(await page.locator('#tick').innerText(),'000000');
    const colors = await page.locator('#field').evaluate(c => {
      const d = c.getContext('2d').getImageData(0,0,c.width,c.height).data, values = new Set();
      for (let i = 0; i < d.length; i += 240) values.add(`${d[i]},${d[i+1]},${d[i+2]}`);
      return values.size;
    });
    assert.ok(colors > 16,`expected a varied field, got ${colors} colors`);
    await noOverflow(page);
    await screenshot(page,'desktop-chemical-gardens.png');
  });

  await check('step advances once and saved moments restore an identical rendered field',async () => {
    await page.locator('#step').click();
    assert.equal(await page.locator('#tick').innerText(),'000001');
    const before = await page.locator('#field').evaluate(c => c.toDataURL());
    await page.locator('#save').click();
    assert.equal(await page.locator('#saved-count').innerText(),'1');
    const stored = await page.evaluate(() => JSON.parse(localStorage.getItem('emergence-atlas.notebook.v1')));
    assert.ok(validateSnapshot(stored[0].snapshot));
    assert.equal(stored[0].snapshot.tick,1);
    await page.locator('[data-world="flock"]').click();
    await page.locator('#notebook-open').click();
    await page.getByRole('button',{ name:'Restore moment' }).click();
    assert.equal(await page.locator('#world-title').innerText(),'Chemical gardens');
    assert.equal(await page.locator('#field').evaluate(c => c.toDataURL()),before);
  });

  let exported;
  await check('JSON exports preserve state and PNG exports are valid images',async () => {
    await page.locator('#notebook-open').click();
    const jsonDownload = page.waitForEvent('download');
    await page.getByRole('button',{ name:'Export',exact:true }).click();
    const json = await jsonDownload;
    exported = await readFile(await json.path());
    assert.ok(validateSnapshot(JSON.parse(exported)));
    await page.getByRole('button',{ name:'Close notebook' }).click();
    const imageDownload = page.waitForEvent('download');
    await page.locator('#export-image').click();
    const image = await imageDownload, bytes = await readFile(await image.path());
    assert.deepEqual([...bytes.subarray(0,8)],[137,80,78,71,13,10,26,10]);
    assert.equal(bytes.readUInt32BE(16),960); assert.equal(bytes.readUInt32BE(20),640);
  });

  await check('valid imports are kept and malformed imports leave the notebook intact',async () => {
    await page.locator('#notebook-open').click();
    await page.locator('#import-file').setInputFiles({ name:'moment.json',mimeType:'application/json',buffer:exported });
    await page.waitForFunction(() => document.querySelector('#saved-count').textContent === '2');
    await page.locator('#import-file').setInputFiles({ name:'bad.json',mimeType:'application/json',buffer:Buffer.from('{"version":1,"kind":"<img src=x onerror=alert(1)>"}') });
    await page.waitForFunction(() => document.querySelector('#toast').textContent.includes('not a valid'));
    assert.equal(await page.locator('#saved-count').innerText(),'2');
    await page.getByRole('button',{ name:'Close notebook' }).click();
  });

  await check('pointer input changes the field and keyboard interaction can disturb it',async () => {
    const before = await page.locator('#field').evaluate(c => c.toDataURL());
    const box = await page.locator('#field').boundingBox();
    await page.mouse.move(box.x+box.width*.3,box.y+box.height*.3); await page.mouse.down();
    await page.mouse.move(box.x+box.width*.65,box.y+box.height*.6,{ steps:8 }); await page.mouse.up();
    await page.waitForFunction(old => document.querySelector('#field').toDataURL() !== old,before);
    await page.locator('#field').focus(); await page.keyboard.press('Enter');
    await page.waitForFunction(() => document.querySelector('#toast').textContent.includes('disturbance'));
  });

  await check('flock controls, play, pause, presets and keyboard shortcuts work',async () => {
    await page.locator('[data-world="flock"]').click();
    assert.equal(await page.locator('#controls .control').count(),5);
    await page.locator('#preset').selectOption('2');
    assert.equal(await page.locator('#param-speed').inputValue(),'4');
    await page.locator('#field').focus(); await page.keyboard.press('Space');
    await page.waitForFunction(() => Number(document.querySelector('#tick').textContent) > 30);
    await page.keyboard.press('Space');
    assert.equal(await page.locator('#play').getAttribute('aria-label'),'Play simulation');
    await screenshot(page,'desktop-murmuration.png');
    await page.keyboard.press('r');
    assert.equal(await page.locator('#tick').innerText(),'000000');
  });

  await check('Life controls keep survival intervals ordered and density restarts the grid',async () => {
    await page.locator('[data-world="life"]').click();
    await page.locator('#param-surviveMin').focus(); await page.keyboard.press('End');
    assert.equal(await page.locator('#param-surviveMax').inputValue(),'8');
    assert.equal(await page.locator('#preset').inputValue(),'custom');
    await page.locator('#preset').selectOption('1');
    await page.locator('#step').click();
    await page.locator('#param-density').focus(); await page.keyboard.press('ArrowRight');
    assert.equal(await page.locator('#tick').innerText(),'000000');
    await screenshot(page,'desktop-living-grid.png');
  });

  await check('recipe links reproduce controls and notebook entries survive reload',async () => {
    await page.locator('#seed').fill('0'); await page.locator('#seed').press('Tab');
    await page.locator('#share').click();
    const link = await page.evaluate(() => navigator.clipboard.readText());
    assert.ok(link.includes('seed=0') && link.includes('world=life'));
    await page.goto(link);
    await page.waitForFunction(() => document.querySelectorAll('#controls .control').length === 4);
    assert.equal(await page.locator('#seed').inputValue(),'0');
    assert.equal(await page.locator('#saved-count').innerText(),'2');
    assert.equal(await page.locator('#param-surviveMin').inputValue(),'4');
  });

  await check('phone layouts fit the screen in every world',async () => {
    await page.setViewportSize({ width:390,height:844 });
    for (const kind of ['reaction','flock','life']) {
      await page.locator(`[data-world="${kind}"]`).click();
      await noOverflow(page);
      assert.ok(await page.locator('#play').isVisible());
    }
    await screenshot(page,'phone-living-grid.png');
    await page.locator('#notebook-open').click(); await noOverflow(page);
    await screenshot(page,'phone-notebook.png');
    await page.getByRole('button',{ name:'Close notebook' }).click();
    await page.setViewportSize({ width:320,height:700 }); await noOverflow(page);
  });

  const pairedContext = await browser.newContext({ viewport:{ width:1440,height:1000 },reducedMotion:'reduce',acceptDownloads:true,permissions:['clipboard-read','clipboard-write'] });
  const paired = await pairedContext.newPage();
  activePage = paired;
  paired.on('pageerror',e => errors.push(e.message));
  paired.on('response',r => { if (r.status() >= 400) errors.push(`${r.status()} ${r.url()}`); });
  await paired.goto(origin);
  await paired.waitForFunction(() => document.querySelectorAll('#controls .control').length === 3);

  await check('comparison forks identical visible fields, varies one rule, and advances two futures',async () => {
    await paired.locator('#step').click();
    await paired.locator('#compare').click();
    assert.equal(await paired.locator('#compare').getAttribute('aria-pressed'),'true');
    assert.ok(await paired.locator('#baseline-world').isVisible());
    assert.ok(await paired.locator('#seed').isDisabled());
    assert.ok(await paired.locator('#controls').isHidden());
    assert.match(await paired.locator('#comparison-note').innerText(),/tick 1\./);
    const equal = await paired.evaluate(() => document.querySelector('#field').toDataURL() === document.querySelector('#field-baseline').toDataURL());
    assert.ok(equal,'the two fields must start from the exact same pixels');
    assert.notEqual(await paired.locator('#baseline-rule').innerText(),await paired.locator('#variant-rule').innerText());
    for (let i = 0; i < 8; i++) await paired.locator('#step').click();
    await paired.waitForFunction(() => document.querySelector('#field').toDataURL() !== document.querySelector('#field-baseline').toDataURL());
    assert.equal(await paired.locator('#tick').innerText(),'000009');
    await noOverflow(paired);
    await paired.locator('#play').click();
    await paired.waitForFunction(() => Number(document.querySelector('#tick').textContent) >= 600);
    await paired.locator('#play').click();
    await screenshot(paired,'desktop-two-futures.png');
  });

  let pairedExport, pairedLink, aPixels, bPixels;
  await check('paired moments export both exact fields, restore them, and reset to the original fork',async () => {
    await paired.locator('#save').click();
    assert.equal(await paired.locator('#saved-count').innerText(),'1');
    aPixels = await paired.locator('#field-baseline').evaluate(c => c.toDataURL());
    bPixels = await paired.locator('#field').evaluate(c => c.toDataURL());
    await paired.locator('#notebook-open').click();
    assert.match(await paired.locator('#notebook-entries').innerText(),/Two futures/);
    const download = paired.waitForEvent('download');
    await paired.getByRole('button',{ name:'Export',exact:true }).click();
    pairedExport = await readFile(await (await download).path());
    assert.equal(JSON.parse(pairedExport).version,2); assert.ok(validateSnapshot(JSON.parse(pairedExport)));
    await paired.getByRole('button',{ name:'Close notebook' }).click();
    await paired.locator('#step').click();
    await paired.locator('#notebook-open').click(); await paired.getByRole('button',{ name:'Restore moment' }).click();
    assert.equal(await paired.locator('#field-baseline').evaluate(c => c.toDataURL()),aPixels);
    assert.equal(await paired.locator('#field').evaluate(c => c.toDataURL()),bPixels);
    const variation = await paired.locator('#compare-value').inputValue();
    await paired.locator('#reset').click();
    assert.equal(await paired.locator('#tick').innerText(),'000001');
    assert.equal(await paired.locator('#compare-value').inputValue(),variation);
    assert.ok(await paired.evaluate(() => document.querySelector('#field').toDataURL() === document.querySelector('#field-baseline').toDataURL()));
  });

  await check('paired PNGs include both fields and recipe links preserve the chosen experiment',async () => {
    const download = paired.waitForEvent('download'); await paired.locator('#export-image').click();
    const bytes = await readFile(await (await download).path());
    assert.equal(bytes.readUInt32BE(16),1968); assert.equal(bytes.readUInt32BE(20),720);
    await paired.locator('#share').click(); pairedLink = await paired.evaluate(() => navigator.clipboard.readText());
    assert.ok(pairedLink.includes('compare=feed'));
    await paired.goto(pairedLink); await paired.reload();
    await paired.waitForFunction(() => document.querySelector('#compare').getAttribute('aria-pressed') === 'true');
    assert.equal(await paired.locator('#tick').innerText(),'000000');
    assert.ok(await paired.evaluate(() => document.querySelector('#field').toDataURL() === document.querySelector('#field-baseline').toDataURL()));
    await paired.locator('#compare-parameter').selectOption('kill');
    assert.match(await paired.locator('#baseline-rule').innerText(),/Removal rate/);
    assert.equal(await paired.locator('#tick').innerText(),'000000');
  });

  await check('paired imports survive reload alongside legacy moments and reject corrupted data',async () => {
    await paired.locator('#notebook-open').click();
    await paired.locator('#import-file').setInputFiles({ name:'legacy.json',mimeType:'application/json',buffer:exported });
    await paired.waitForFunction(() => document.querySelector('#saved-count').textContent === '2');
    await paired.locator('#import-file').setInputFiles({ name:'pair.json',mimeType:'application/json',buffer:pairedExport });
    await paired.waitForFunction(() => document.querySelector('#saved-count').textContent === '3');
    const bad = JSON.parse(pairedExport); bad.variant.encoding = 'script';
    await paired.locator('#import-file').setInputFiles({ name:'bad-pair.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(bad)) });
    await paired.waitForFunction(() => document.querySelector('#toast').textContent.includes('not a valid'));
    assert.equal(await paired.locator('#saved-count').innerText(),'3');
    await paired.getByRole('button',{ name:'Close notebook' }).click();
    await paired.reload();
    await paired.waitForFunction(() => document.querySelector('#saved-count').textContent === '3');
    await paired.locator('#notebook-open').click();
    await paired.getByRole('button',{ name:'Restore moment' }).first().click();
    assert.equal(await paired.locator('#field-baseline').evaluate(c => c.toDataURL()),aPixels);
    assert.equal(await paired.locator('#field').evaluate(c => c.toDataURL()),bPixels);
  });

  await check('comparisons fit desktop and phone widths, mirror input, and can continue with the variant',async () => {
    for (const kind of ['reaction','flock','life']) {
      await paired.setViewportSize({ width:1440,height:1000 });
      await paired.locator(`[data-world="${kind}"]`).click();
      await paired.locator('#compare').click();
      if (kind === 'life') {
        assert.equal(await paired.locator('#compare-parameter option[value="density"]').count(),0);
        await paired.locator('#compare-parameter').selectOption('surviveMin');
        assert.equal(await paired.locator('#compare-value').getAttribute('max'),'3');
        await paired.locator('#compare-value').focus(); await paired.keyboard.press('End');
      }
      for (const width of [1024,768,390,320]) { await paired.setViewportSize({ width,height:900 }); await noOverflow(paired); }
      const before = await paired.locator('#field').evaluate(c => c.toDataURL());
      await paired.locator('#field-baseline').focus(); await paired.keyboard.press('Enter');
      if (kind !== 'flock') {
        await paired.waitForFunction(old => document.querySelector('#field').toDataURL() !== old,before);
        assert.ok(await paired.evaluate(() => document.querySelector('#field').toDataURL() === document.querySelector('#field-baseline').toDataURL()));
      }
      await paired.setViewportSize({ width:390,height:844 });
      if (kind === 'life') await screenshot(paired,'phone-two-futures.png');
      await paired.locator('#compare').click();
      assert.equal(await paired.locator('#compare').getAttribute('aria-pressed'),'false');
      assert.ok(await paired.locator('#baseline-world').isHidden());
      assert.ok(await paired.locator('#seed').isEnabled());
    }
  });
  await pairedContext.close();
  activePage = page;

  const mapContext = await browser.newContext({ viewport:{ width:1440,height:1100 },reducedMotion:'reduce',acceptDownloads:true });
  const maps = await mapContext.newPage(); activePage = maps;
  maps.on('pageerror',e => errors.push(e.message));
  maps.on('response',r => { if (r.status() >= 400) errors.push(`${r.status()} ${r.url()}`); });
  await maps.goto(origin);
  await maps.waitForFunction(() => document.querySelectorAll('#controls .control').length === 3);

  await check('chemical difference maps start at zero and contrast changes leave both fields and their recipe unchanged',async () => {
    assert.ok(await maps.locator('#difference-toggle').isHidden());
    await maps.locator('#compare').click(); await maps.locator('#difference-toggle').click();
    assert.ok(await maps.locator('#difference-panel').isVisible());
    const zero = await maps.locator('#difference-field').evaluate(c => {
      const d = c.getContext('2d').getImageData(0,0,c.width,c.height).data;
      for (let i = 0; i < d.length; i += 4) if (d[i] !== 10 || d[i+1] !== 23 || d[i+2] !== 29 || d[i+3] !== 255) return false;
      return true;
    });
    assert.ok(zero,'identical chemical concentrations must make a uniformly zero map');
    await maps.locator('#play').click();
    await maps.waitForFunction(() => Number(document.querySelector('#tick').textContent) >= 180);
    await maps.locator('#play').click();
    const before = await maps.evaluate(() => ({
      a:document.querySelector('#field-baseline').toDataURL(),b:document.querySelector('#field').toDataURL(),tick:document.querySelector('#tick').textContent,hash:location.hash,
    }));
    await maps.locator('#difference-gain').selectOption('1');
    const low = await maps.locator('#difference-field').evaluate(c => c.toDataURL());
    await maps.locator('#difference-gain').selectOption('16');
    assert.notEqual(await maps.locator('#difference-field').evaluate(c => c.toDataURL()),low);
    assert.match(await maps.locator('#difference-scale').innerText(),/0\.0625/);
    assert.deepEqual(await maps.evaluate(() => ({
      a:document.querySelector('#field-baseline').toDataURL(),b:document.querySelector('#field').toDataURL(),tick:document.querySelector('#tick').textContent,hash:location.hash,
    })),before);
    await noOverflow(maps); await screenshot(maps,'desktop-difference-map.png');
  });

  await check('difference PNGs carry a scale and restored paired moments reconstruct the same map',async () => {
    const download = maps.waitForEvent('download'); await maps.locator('#export-difference').click();
    const bytes = await readFile(await (await download).path());
    assert.deepEqual([...bytes.subarray(0,8)],[137,80,78,71,13,10,26,10]);
    assert.equal(bytes.readUInt32BE(16),960); assert.equal(bytes.readUInt32BE(20),768);
    const pixels = await maps.locator('#difference-field').evaluate(c => c.toDataURL());
    await maps.locator('#save').click(); assert.equal(await maps.locator('#saved-count').innerText(),'1');
    await maps.locator('#step').click();
    await maps.locator('#notebook-open').click(); await maps.getByRole('button',{ name:'Restore moment' }).click();
    assert.equal(await maps.locator('#difference-field').evaluate(c => c.toDataURL()),pixels);
    await maps.locator('#difference-toggle').click(); assert.ok(await maps.locator('#difference-panel').isHidden());
  });

  await check('Life difference maps use exact occupancy categories and fit narrow phones',async () => {
    await maps.locator('[data-world="life"]').click(); await maps.locator('#compare').click(); await maps.locator('#difference-toggle').click();
    assert.ok(await maps.locator('#difference-gain-label').isHidden());
    assert.ok(await maps.locator('#difference-categories').isVisible());
    await maps.locator('#step').click();
    const colors = await maps.locator('#difference-field').evaluate(c => {
      const pixels = c.getContext('2d').getImageData(0,0,c.width,c.height).data, found = new Set();
      for (let i = 0; i < pixels.length; i += 4) found.add(`${pixels[i]},${pixels[i+1]},${pixels[i+2]}`);
      return [...found].sort();
    });
    assert.deepEqual(colors,['10,23,29','51,75,65','239,170,108','112,210,224'].sort());
    for (const width of [1024,768,390,320]) { await maps.setViewportSize({ width,height:900 }); await noOverflow(maps); }
    await maps.setViewportSize({ width:390,height:844 }); await screenshot(maps,'phone-difference-map.png');
  });

  await check('flock difference maps explain wrapping paths, can export, and disappear when leaving comparison',async () => {
    await maps.setViewportSize({ width:1440,height:1100 });
    await maps.locator('[data-world="flock"]').click(); await maps.locator('#compare').click(); await maps.locator('#difference-toggle').click();
    await maps.locator('#difference-gain').selectOption('1');
    assert.match(await maps.locator('#difference-scale').innerText(),/576\.89 world units/);
    assert.match(await maps.locator('#difference-description').innerText(),/Amber rings mark A; cyan dots mark B/);
    assert.ok(await maps.locator('#difference-categories').isHidden());
    assert.ok(await maps.locator('#difference-gradient').isVisible());
    await maps.locator('#play').click();
    await maps.waitForFunction(() => Number(document.querySelector('#tick').textContent) >= 180);
    await maps.locator('#play').click();
    await noOverflow(maps); await screenshot(maps,'desktop-traveler-paths.png');
    const download = maps.waitForEvent('download'); await maps.locator('#export-difference').click();
    assert.match((await download).suggestedFilename(),/flock.*difference\.png$/);
    await maps.locator('#compare').click();
    assert.ok(await maps.locator('#difference-toggle').isHidden()); assert.ok(await maps.locator('#difference-panel').isHidden());
  });
  await mapContext.close(); activePage = page;

  await check('storage failure offers a portable export without claiming a save',async () => {
    const blocked = await browser.newContext({ reducedMotion:'reduce',acceptDownloads:true });
    await blocked.addInitScript(() => { Storage.prototype.setItem = () => { throw new Error('Storage disabled'); }; });
    const p = await blocked.newPage(); p.on('pageerror',e => errors.push(e.message));
    await p.goto(origin); await p.waitForFunction(() => document.querySelectorAll('#controls .control').length === 3);
    const download = p.waitForEvent('download'); await p.locator('#save').click();
    assert.ok(validateSnapshot(JSON.parse(await readFile(await (await download).path()))));
    assert.equal(await p.locator('#saved-count').innerText(),'0');
    assert.match(await p.locator('#toast').innerText(),/could not be saved/);
    await blocked.close();
  });

  await check('invalid recipes fail safely and ordinary motion begins playing',async () => {
    const normal = await browser.newContext({ reducedMotion:'no-preference' });
    const p = await normal.newPage(); p.on('pageerror',e => errors.push(e.message));
    await p.goto(`${origin}/#world=__proto__`);
    await p.waitForFunction(() => Number(document.querySelector('#tick').textContent) > 0);
    assert.equal(await p.locator('#world-title').innerText(),'Chemical gardens');
    assert.equal(await p.locator('#play').getAttribute('aria-label'),'Pause simulation');
    await normal.close();
  });

  assert.deepEqual(errors,[],'browser console or HTTP errors');
  await writeFile(new URL('report.json',out),JSON.stringify({ status:'passed',browser:browser.version(),channel:process.env.ATLAS_BROWSER_CHANNEL || 'bundled chromium',checks:results,errors },null,2));
  console.log(`\n${results.length} browser checks passed.`);
} catch (error) {
  if (activePage) await screenshot(activePage,'failure.png').catch(() => {});
  await writeFile(new URL('report.json',out),JSON.stringify({ status:'failed',checks:results,errors,failure:error.stack },null,2));
  throw error;
} finally {
  await browser?.close(); server.kill();
}
