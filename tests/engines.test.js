import test from 'node:test';
import assert from 'node:assert/strict';
import { random, wrap, delta } from '../src/random.js';
import { catalog, defaults } from '../src/catalog.js';
import { Reaction } from '../src/engines/reaction.js';
import { Life } from '../src/engines/life.js';
import { Flock } from '../src/engines/flock.js';

test('seeded randomness repeats, includes seed zero, and stays in [0,1)', () => {
  const a = random(0), b = random(0), c = random(1);
  let differs = false;
  for (let i = 0; i < 1000; i++) {
    const v = a(); assert.equal(v,b()); assert.ok(v >= 0 && v < 1);
    if (v !== c()) differs = true;
  }
  assert.ok(differs);
});

test('toroidal coordinates handle negative positions and shortest seam distances', () => {
  assert.equal(wrap(-1,10),9); assert.equal(wrap(21,10),1);
  assert.equal(delta(1,9,10),-2); assert.equal(delta(9,1,10),2);
});

test('Gray–Scott state is reproducible and remains finite for every preset', () => {
  for (const preset of catalog.reaction.presets) {
    const a = new Reaction(41827,preset.params), b = new Reaction(41827,preset.params);
    assert.deepEqual(a.v,b.v);
    for (let t = 0; t < 80; t++) { a.step(); b.step(); }
    assert.deepEqual(a.snapshot(),b.snapshot());
    assert.ok(a.v.some(v => v > .1),`${preset.name} should have a visible pattern`);
    for (const values of [a.u,a.v]) assert.ok(values.every(v => Number.isFinite(v) && v >= 0 && v <= 1));
  }
});

test('Gray–Scott brush crosses both wrapping seams', () => {
  const world = new Reaction(8,defaults('reaction'));
  world.u.fill(1); world.v.fill(0); world.paint(0,0,2);
  assert.ok(world.v[world.width-1] > .5);
  assert.ok(world.v[(world.height-1)*world.width] > .5);
});

const alive = world => Array.from(world.cells.entries()).filter(([,v]) => v > 0).map(([i]) => i);
test('Conway blinker oscillates with simultaneous updates', () => {
  const w = new Life(0,defaults('life'));
  w.cells.fill(0);
  const base = 10*w.width+10;
  [base-1,base,base+1].forEach(i => w.cells[i] = 1);
  w.step(); assert.deepEqual(alive(w),[base-w.width,base,base+w.width]);
  w.step(); assert.deepEqual(alive(w),[base-1,base,base+1]);
  assert.equal(w.cells[base],3);
});

test('Conway still life preserves old cells, saturates age, and wraps neighbors', () => {
  const w = new Life(1,defaults('life')); w.cells.fill(0);
  const corners = [0,w.width-1,(w.height-1)*w.width,w.cells.length-1];
  corners.forEach(i => w.cells[i] = 255);
  w.step(); assert.deepEqual(alive(w),corners.toSorted((a,b) => a-b));
  corners.forEach(i => assert.equal(w.cells[i],255));
});

test('flocking is repeatable and all travelers remain in bounds at the requested speed', () => {
  const a = new Flock(77,defaults('flock')), b = new Flock(77,defaults('flock'));
  a.paint(.99,.1); b.paint(.99,.1);
  for (let i = 0; i < 120; i++) { a.step(); b.step(); }
  assert.deepEqual(a.snapshot(),b.snapshot());
  for (const boid of a.boids) {
    assert.ok(boid.x >= 0 && boid.x < a.width && boid.y >= 0 && boid.y < a.height);
    assert.ok(Math.abs(Math.hypot(boid.vx,boid.vy)-a.params.speed) < 1e-10);
  }
  a.release(); assert.equal(a.target,null);
});

test('flock neighbors across the seam influence each other', () => {
  const world = new Flock(1,{ ...defaults('flock'), separation:0, cohesion:0, alignment:3 });
  world.boids = [{ x:1,y:100,vx:0,vy:2.8 },{ x:959,y:100,vx:2.8,vy:0 }];
  world.step();
  assert.ok(world.boids[0].vx > 0);
  assert.ok(world.boids[1].vy > 0);
});

test('different seeds make different worlds', () => {
  assert.notDeepEqual(new Life(1,defaults('life')).cells,new Life(2,defaults('life')).cells);
  assert.notDeepEqual(new Flock(1,defaults('flock')).boids,new Flock(2,defaults('flock')).boids);
});
