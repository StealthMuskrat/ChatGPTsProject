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
let browser, page;
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
async function screenshot(p,name) { await p.screenshot({ path:fileURLToPath(new URL(name,out)),fullPage:true }); }

try {
  let ready = false;
  for (let i = 0; i < 60; i++) {
    try { if ((await fetch(origin)).ok) { ready = true; break; } } catch { /* Server is starting. */ }
    await new Promise(r => setTimeout(r,100));
  }
  assert.ok(ready,`Server failed to start: ${serverLog}`);
  browser = await chromium.launch({ headless:true });
  const context = await browser.newContext({ viewport:{ width:1440,height:1100 },reducedMotion:'reduce',acceptDownloads:true,permissions:['clipboard-read','clipboard-write'] });
  page = await context.newPage();
  context.on('page', p => p.on('pageerror',e => errors.push(e.message)));
  page.on('pageerror',e => errors.push(e.message));
  page.on('response',r => { if (r.status() >= 400) errors.push(`${r.status()} ${r.url()}`); });
  await page.goto(origin);
  await page.waitForFunction(() => document.querySelectorAll('.control').length === 3);

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
    assert.equal(await page.locator('.control').count(),5);
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
    await page.waitForFunction(() => document.querySelectorAll('.control').length === 4);
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

  await check('storage failure offers a portable export without claiming a save',async () => {
    const blocked = await browser.newContext({ reducedMotion:'reduce',acceptDownloads:true });
    await blocked.addInitScript(() => { Storage.prototype.setItem = () => { throw new Error('Storage disabled'); }; });
    const p = await blocked.newPage(); p.on('pageerror',e => errors.push(e.message));
    await p.goto(origin); await p.waitForFunction(() => document.querySelectorAll('.control').length === 3);
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
  await writeFile(new URL('report.json',out),JSON.stringify({ status:'passed',checks:results,errors },null,2));
  console.log(`\n${results.length} browser checks passed.`);
} catch (error) {
  if (page) await screenshot(page,'failure.png').catch(() => {});
  await writeFile(new URL('report.json',out),JSON.stringify({ status:'failed',checks:results,errors,failure:error.stack },null,2));
  throw error;
} finally {
  await browser?.close(); server.kill();
}
