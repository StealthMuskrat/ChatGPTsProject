import test from 'node:test';
import assert from 'node:assert/strict';
import { defaults } from '../src/catalog.js';
import { comparisonControls, comparisonBounds, validComparisonParams, advanceWorld, paintWorld, releaseWorld, differenceMetric } from '../src/comparison.js';
import { worldFromRecipe, forkComparison, restartComparison, snapshotOf, restoreSnapshot, validateSnapshot, recipeOf, readLink, linkHash, MAX_IMPORT_BYTES } from '../src/state.js';

const rule = { reaction:'feed',flock:'alignment',life:'birth' };
const world = kind => worldFromRecipe({ kind,seed:87,params:defaults(kind) });

test('a fork preserves the exact current field in independent engines and changes only one rule', () => {
  for (const kind of Object.keys(rule)) {
    const source = world(kind); advanceWorld(source,7); paintWorld(source,.2,.8); releaseWorld(source);
    const before = source.engine.snapshot(), pair = forkComparison(source,rule[kind]);
    assert.equal(pair.tick,7);
    assert.deepEqual(pair.engine.snapshot(),before);
    assert.deepEqual(pair.comparison.baseline.snapshot(),before);
    assert.notEqual(pair.engine.params[rule[kind]],pair.comparison.baseline.params[rule[kind]]);
    assert.ok(validComparisonParams(kind,rule[kind],pair.comparison.baseline.params,pair.engine.params));
    pair.engine.paint(.6,.3);
    assert.deepEqual(pair.comparison.baseline.snapshot(),before);
    assert.deepEqual(source.engine.snapshot(),before);
  }
});

test('identical rules with shared input stay identical for every world', () => {
  for (const kind of Object.keys(rule)) {
    const pair = forkComparison(world(kind),rule[kind],false);
    paintWorld(pair,.99,.01); advanceWorld(pair,15); releaseWorld(pair);
    assert.equal(pair.tick,15);
    assert.deepEqual(pair.engine.snapshot(),pair.comparison.baseline.snapshot());
  }
});

test('varying a rule produces different futures on the same clock', () => {
  for (const kind of Object.keys(rule)) {
    const pair = forkComparison(world(kind),rule[kind]); advanceWorld(pair,10);
    assert.equal(pair.tick,10);
    assert.notDeepEqual(pair.engine.snapshot(),pair.comparison.baseline.snapshot());
  }
});

test('reset returns to the fork, retains the selected variation, and changing rules resets other values', () => {
  const source = world('life'); advanceWorld(source,11);
  const origin = source.engine.snapshot();
  let pair = forkComparison(source,'birth'); const birth = pair.engine.params.birth;
  paintWorld(pair,.5,.5); advanceWorld(pair,20);
  pair = restartComparison(pair);
  assert.equal(pair.tick,11); assert.equal(pair.engine.params.birth,birth);
  assert.deepEqual(pair.engine.snapshot(),origin); assert.deepEqual(pair.comparison.baseline.snapshot(),origin);
  pair = restartComparison(pair,'surviveMin');
  assert.equal(pair.engine.params.birth,source.engine.params.birth);
  assert.ok(validComparisonParams('life','surviveMin',pair.comparison.baseline.params,pair.engine.params));
  assert.deepEqual(pair.engine.snapshot(),origin);
});

test('comparison recipes round-trip and apply changed rules after the common initial field', () => {
  for (const kind of Object.keys(rule)) {
    const pair = forkComparison(world(kind),rule[kind]); advanceWorld(pair,5);
    const recipe = recipeOf(pair), decoded = readLink(linkHash(recipe));
    assert.deepEqual(decoded,recipe);
    const fresh = worldFromRecipe(decoded);
    assert.equal(fresh.tick,0);
    assert.deepEqual(fresh.engine.snapshot(),fresh.comparison.baseline.snapshot());
    assert.deepEqual(fresh.engine.params,pair.engine.params);
  }
});

test('paired exports preserve both futures and their reset point exactly, without altering version 1', () => {
  for (const kind of Object.keys(rule)) {
    const single = world(kind), legacy = snapshotOf(single);
    assert.equal(legacy.version,1); assert.ok(validateSnapshot(legacy));
    assert.deepEqual(restoreSnapshot(legacy).engine.snapshot(),single.engine.snapshot());
    advanceWorld(single,3);
    const pair = forkComparison(single,rule[kind]); advanceWorld(pair,9);
    const saved = JSON.parse(JSON.stringify(snapshotOf(pair)));
    assert.equal(saved.version,2); assert.ok(validateSnapshot(saved));
    assert.ok(JSON.stringify(saved).length < MAX_IMPORT_BYTES);
    if (kind === 'reaction') assert.ok(JSON.stringify(saved).length < 850000,'paired chemical fields should fit comfortably in a browser notebook');
    const restored = restoreSnapshot(saved);
    assert.deepEqual(restored.engine.snapshot(),pair.engine.snapshot());
    assert.deepEqual(restored.comparison.baseline.snapshot(),pair.comparison.baseline.snapshot());
    advanceWorld(pair,5); advanceWorld(restored,5);
    assert.deepEqual(snapshotOf(restored),snapshotOf(pair));
    assert.deepEqual(restartComparison(restored).engine.snapshot(),single.engine.snapshot());
    restored.comparison.origin.params[rule[kind]] = 0;
    assert.notEqual(saved.origin.params[rule[kind]],0,'restores must not alias saved moments');
  }
});

test('paired import validation rejects mismatched clocks, multiple varied rules, and invalid byte encodings', () => {
  const s = snapshotOf(forkComparison(world('life'),'birth'));
  const change = fn => { const bad = structuredClone(s); fn(bad); assert.equal(validateSnapshot(bad),false); assert.throws(() => restoreSnapshot(bad),/not a valid/); };
  change(s => { s.version = 3; });
  change(s => { s.kind = '__proto__'; });
  change(s => { s.tick = 1; });
  change(s => { s.origin.tick = 1; });
  change(s => { s.baseline.params.birth = 5; });
  change(s => { s.variant.params.density = .3; });
  change(s => { s.parameter = 'density'; });
  change(s => { s.variant.data.cells = 'x'; });
  change(s => { s.origin.encoding = 'script'; });
  change(s => { s.variant.data.cells = '!'.repeat(s.variant.data.cells.length); });
  change(s => { s.baseline = null; });
  const chemical = snapshotOf(forkComparison(world('reaction'),'feed'));
  const bytes = new Uint8Array(192*128*4); new DataView(bytes.buffer).setFloat32(0,NaN,true);
  let data = ''; for (let i = 0; i < bytes.length; i += 8192) data += String.fromCharCode(...bytes.subarray(i,i+8192));
  chemical.variant.data.u = btoa(data); assert.equal(validateSnapshot(chemical),false);
});

test('only live rules are selectable and survival intervals remain coherent when just one endpoint changes', () => {
  assert.ok(!comparisonControls('life').some(c => c.key === 'density'));
  const params = defaults('life');
  assert.equal(comparisonBounds('life','surviveMin',params).max,3);
  assert.equal(comparisonBounds('life','surviveMax',params).min,2);
  assert.throws(() => forkComparison(world('life'),'density'),/Invalid/);
  const recipe = { kind:'life',seed:0,params:{ ...params,birth:4,density:.3 },comparison:{ parameter:'birth',baseline:params } };
  assert.equal(readLink(linkHash(recipe)),null);
  assert.equal(readLink('#world=life&compare=birth&baseline=null'),null);
});

test('difference statistics use concentrations, occupancy rather than age, and wrapping traveler distance', () => {
  assert.equal(differenceMetric('reaction',{ v:[0,.5] },{ v:[.25,.25] }).value,'0.2500');
  assert.equal(differenceMetric('life',{ cells:[1,0,5,0] },{ cells:[255,1,2,0] }).value,'25.0%');
  assert.equal(differenceMetric('flock',{ width:960,height:640,boids:[{ x:1,y:10 }] },{ boids:[{ x:959,y:10 }] }).value,'2.00 units');
});
