import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { fileURLToPath } from 'node:url';

test('development server serves the root and assets, supports HEAD, and rejects hidden or missing paths',async () => {
  const child = spawn(process.execPath,['scripts/serve.js'],{
    cwd:fileURLToPath(new URL('..',import.meta.url)),env:{ ...process.env,PORT:'0' },stdio:['ignore','pipe','pipe'],
  });
  try {
    const [chunk] = await once(child.stdout,'data',{ signal:AbortSignal.timeout(10000) });
    const origin = String(chunk).match(/http:\/\/localhost:(\d+)/)?.[0];
    assert.ok(origin);
    const home = await fetch(origin);
    assert.equal(home.status,200); assert.match(await home.text(),/Emergence Atlas/);
    const script = await fetch(`${origin}/src/app.js`);
    assert.equal(script.status,200); assert.match(script.headers.get('content-type'),/javascript/);
    assert.equal(script.headers.get('x-content-type-options'),'nosniff');
    const head = await fetch(origin,{ method:'HEAD' });
    assert.equal(head.status,200); assert.equal(await head.text(),'');
    for (const path of ['/.github/workflows/check.yml','/missing','/%00']) assert.equal((await fetch(origin+path)).status,404);
    assert.equal((await fetch(origin,{ method:'POST' })).status,405);
  } finally { child.kill(); }
});
