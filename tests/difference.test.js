import test from 'node:test';
import assert from 'node:assert/strict';
import { chemicalDifferences, lifeDifferences, travelerDisplacements, heatColor, mapColors, mapInfo } from '../src/difference.js';
import { defaults } from '../src/catalog.js';
import { worldFromRecipe, forkComparison, snapshotOf } from '../src/state.js';
import { advanceWorld } from '../src/comparison.js';

test('chemical maps measure absolute v differences, exclude u, and own their values', () => {
  const a = { u:[0,1,1],v:[0,.75,.25] }, b = { u:[1,0,0],v:[0,.25,.75] };
  const values = chemicalDifferences(a,b);
  assert.deepEqual([...values],[0,.5,.5]);
  values[0] = 1; assert.equal(a.v[0],0); assert.equal(b.v[0],0);
});

test('life maps distinguish all four occupancy classes and ignore ages', () => {
  const a = { cells:[0,1,255,0,1] }, b = { cells:[0,255,0,1,10] };
  assert.deepEqual([...lifeDifferences(a,b)],[0,1,2,3,1]);
});

test('traveler maps match identity and choose shortest horizontal and vertical wrapping paths', () => {
  const a = { width:960,height:640,boids:[{ x:1,y:1 },{ x:100,y:100 }] };
  const b = { boids:[{ x:959,y:639 },{ x:101,y:99 }] };
  const paths = travelerDisplacements(a,b);
  assert.deepEqual([paths[0].dx,paths[0].dy],[-2,-2]);
  assert.equal(paths[0].distance,Math.sqrt(8));
  assert.deepEqual([paths[1].dx,paths[1].dy],[1,-1]);
  assert.equal(paths[0].bx,959); assert.equal(paths[0].by,639);
});

test('map scales have a stable zero, documented clipping, and explicit contrast', () => {
  for (const gain of [1,4,16]) assert.deepEqual(heatColor(0,gain),mapColors.empty);
  assert.deepEqual(heatColor(1),heatColor(10));
  assert.deepEqual(heatColor(.0625,16),heatColor(1));
  assert.match(mapInfo('reaction',{},16).scale,/0\.0625/);
  assert.match(mapInfo('reaction',{},4).note,/Fixed linear scale at 4×/);
  assert.match(mapInfo('flock',{ width:960,height:640 },1).scale,/576\.89/);
  assert.match(mapInfo('life',{},16).note,/categories/);
});

test('computing and changing map contrast leaves both simulation futures untouched', () => {
  const state = forkComparison(worldFromRecipe({ kind:'life',seed:1,params:defaults('life') }),'birth');
  advanceWorld(state,7);
  const before = snapshotOf(state);
  for (const gain of [1,4,16]) {
    const values = lifeDifferences(state.comparison.baseline,state.engine);
    mapInfo(state.kind,state.comparison.baseline,gain);
    for (const value of values) heatColor(value/3,gain);
  }
  assert.deepEqual(snapshotOf(state),before);
});
