import test from 'node:test';
import assert from 'node:assert/strict';
import { catalog, defaults, validParams } from '../src/catalog.js';
import { engines, readLink, linkHash, snapshotOf, restoreSnapshot, validateSnapshot } from '../src/state.js';

test('all recipes round-trip including the zero and maximum seed', () => {
  for (const kind of Object.keys(catalog)) for (const seed of [0,41827,4294967295]) {
    const recipe = { kind,seed,params:defaults(kind) };
    assert.deepEqual(readLink(`#${linkHash(recipe)}`),recipe);
  }
});

test('recipe validation rejects unknown kinds, invalid JSON, off-grid or missing parameters', () => {
  for (const hash of ['#world=__proto__','#world=constructor','#world=missing','#seed=-1','#seed=1.2','#seed=4294967296','#params=%7Bbroken','#world=life&params=null','#world=life&params={}']) assert.equal(readLink(hash),null,hash);
  assert.equal(validParams('constructor',{}),false);
  assert.equal(validParams('reaction',{ ...defaults('reaction'), feed:.0371 }),false);
  assert.equal(validParams('flock',{ ...defaults('flock'),speed:Infinity }),false);
  assert.equal(validParams('life',{ ...defaults('life'),extra:1 }),false);
  assert.equal(validParams('life',{ ...defaults('life'),surviveMin:8,surviveMax:2 }),false);
});

test('every snapshot survives JSON transport and resumes with the same future', () => {
  for (const kind of Object.keys(engines)) {
    const world = { kind,seed:27,tick:13,engine:new engines[kind](27,defaults(kind)) };
    world.engine.paint(.4,.6);
    // A transient pointer target is an interaction, not part of a saved moment.
    world.engine.release?.();
    for (let i = 0; i < world.tick; i++) world.engine.step();
    const snapshot = JSON.parse(JSON.stringify(snapshotOf(world)));
    assert.ok(validateSnapshot(snapshot));
    const restored = restoreSnapshot(snapshot);
    assert.deepEqual(restored.engine.snapshot(),world.engine.snapshot());
    for (let i = 0; i < 9; i++) { restored.engine.step(); world.engine.step(); }
    assert.deepEqual(restored.engine.snapshot(),world.engine.snapshot());
    assert.equal(restored.tick,13);
  }
});

test('snapshot validation rejects corrupted state before allocating an engine', () => {
  for (const kind of Object.keys(engines)) {
    const s = snapshotOf({ kind,seed:9,tick:0,engine:new engines[kind](9,defaults(kind)) });
    for (const bad of [null,{}, { ...s,version:2 },{ ...s,tick:-1 },{ ...s,tick:NaN },{ ...s,seed:-1 },{ ...s,data:{} },{ ...s,params:{} },{ ...s,kind:'__proto__' }]) {
      assert.equal(validateSnapshot(bad),false);
      assert.throws(() => restoreSnapshot(bad),/not a valid/);
    }
    if (kind === 'reaction') { s.data.u[0] = NaN; assert.equal(validateSnapshot(s),false); }
    if (kind === 'life') { s.data.cells[0] = 256; assert.equal(validateSnapshot(s),false); }
    if (kind === 'flock') { s.data.boids[0].vx = 999; assert.equal(validateSnapshot(s),false); }
  }
});

test('snapshots and restores own their arrays rather than aliasing saved moments', () => {
  const world = { kind:'life',seed:9,tick:0,engine:new engines.life(9,defaults('life')) };
  const snapshot = snapshotOf(world), restored = restoreSnapshot(snapshot);
  const saved = snapshot.data.cells[0];
  world.engine.cells[0] = 255; restored.engine.cells[0] = 123;
  assert.equal(snapshot.data.cells[0],saved);
});
