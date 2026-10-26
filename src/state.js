import { catalog, defaults, validParams } from './catalog.js';
import { Reaction } from './engines/reaction.js';
import { Life } from './engines/life.js';
import { Flock } from './engines/flock.js';
import { validComparisonParams, suggestedValue } from './comparison.js';
import { packPart, unpackPart } from './encoding.js';

export const engines = { reaction: Reaction, life: Life, flock: Flock };
export const MAX_IMPORT_BYTES = 8_000_000;
export function newSeed() {
  return crypto.getRandomValues(new Uint32Array(1))[0];
}

export function readLink(hash) {
  try {
    const q = new URLSearchParams(hash.replace(/^#/, ''));
    const kind = q.get('world') || 'reaction';
    if (!Object.hasOwn(catalog, kind)) return null;
    const seed = q.has('seed') ? Number(q.get('seed')) : 41827;
    const params = q.has('params') ? JSON.parse(q.get('params')) : defaults(kind);
    if (!validSeed(seed) || !validParams(kind, params)) return null;
    if (q.has('compare')) {
      const parameter = q.get('compare'), baseline = JSON.parse(q.get('baseline'));
      if (!validComparisonParams(kind,parameter,baseline,params)) return null;
      return { kind, seed, params, comparison:{ parameter,baseline } };
    }
    return { kind, seed, params };
  } catch { return null; }
}

export function linkHash({ kind, seed, params, comparison }) {
  const query = new URLSearchParams({ world: kind, seed: String(seed), params: JSON.stringify(params) });
  if (comparison) {
    query.set('compare',comparison.parameter);
    query.set('baseline',JSON.stringify(comparison.baseline));
  }
  return query.toString();
}

export function recipeOf(state) {
  const recipe = { kind:state.kind,seed:state.seed,params:{ ...state.engine.params } };
  if (state.comparison) recipe.comparison = { parameter:state.comparison.parameter,baseline:{ ...state.comparison.baseline.params } };
  return recipe;
}

const validSeed = s => Number.isInteger(s) && s >= 0 && s <= 4294967295;
const arrayOf = (a, length, check) => Array.isArray(a) && a.length === length && a.every(check);
const unit = x => typeof x === 'number' && Number.isFinite(x) && x >= 0 && x <= 1;

function validateSingle(s) {
  if (!s || s.version !== 1 || !Object.hasOwn(engines, s.kind) || !validSeed(s.seed) || !validParams(s.kind, s.params)) return false;
  if (!Number.isSafeInteger(s.tick) || s.tick < 0 || s.tick > 1e12) return false;
  const d = s.data;
  if (!d || typeof d !== 'object') return false;
  if (s.kind === 'reaction') return arrayOf(d.u, 192*128, unit) && arrayOf(d.v, 192*128, unit);
  if (s.kind === 'life') return arrayOf(d.cells, 144*96, x => Number.isInteger(x) && x >= 0 && x <= 255);
  return arrayOf(d.boids, 200, b => b && typeof b === 'object' && ['x','y','vx','vy'].every(k => typeof b[k] === 'number' && Number.isFinite(b[k])) &&
    b.x >= 0 && b.x < 960 && b.y >= 0 && b.y < 640 && Math.hypot(b.vx,b.vy) > 0 && Math.hypot(b.vx,b.vy) <= 5.001);
}

function singleSnapshot(state) {
  return { version: 1, kind: state.kind, seed: state.seed, params: { ...state.engine.params }, tick: state.tick, data: state.engine.snapshot() };
}

function restoreSingle(snapshot) {
  const engine = new engines[snapshot.kind](snapshot.seed, snapshot.params, { initialize:false });
  engine.restore(snapshot.data);
  return { kind: snapshot.kind, seed: snapshot.seed, tick: snapshot.tick, engine };
}

export function validateSnapshot(s) {
  if (s?.version === 1) return validateSingle(s);
  if (!s || s.version !== 2 || s.mode !== 'comparison') return false;
  let origin, baseline, variant;
  try { [origin,baseline,variant] = ['origin','baseline','variant'].map(k => unpackPart(s.kind,s.seed,s[k])); }
  catch { return false; }
  if (![origin,baseline,variant].every(validateSingle)) return false;
  if (![origin,baseline,variant].every(w => w.kind === s.kind && w.seed === s.seed)) return false;
  if (baseline.tick !== s.tick || variant.tick !== s.tick || origin.tick > s.tick) return false;
  if (!Object.keys(origin.params).every(k => origin.params[k] === baseline.params[k])) return false;
  return validComparisonParams(s.kind,s.parameter,baseline.params,variant.params);
}

export function snapshotOf(state) {
  if (!state.comparison) return singleSnapshot(state);
  return { version:2,mode:'comparison',kind:state.kind,seed:state.seed,tick:state.tick,
    parameter:state.comparison.parameter,origin:packPart(state.kind,state.comparison.origin),
    baseline:packPart(state.kind,singleSnapshot({ ...state,engine:state.comparison.baseline })),variant:packPart(state.kind,singleSnapshot(state)) };
}

export function restoreSnapshot(snapshot) {
  if (!validateSnapshot(snapshot)) throw new Error('This is not a valid Emergence Atlas experiment (versions 1 and 2).');
  if (snapshot.version === 1) return restoreSingle(snapshot);
  const [origin,baseline,variant] = ['origin','baseline','variant'].map(k => unpackPart(snapshot.kind,snapshot.seed,snapshot[k]));
  const state = restoreSingle(variant);
  state.comparison = { parameter:snapshot.parameter,origin:structuredClone(origin),baseline:restoreSingle(baseline).engine };
  return state;
}

export function forkComparison(state, parameter, nudge = true) {
  const params = state.engine.params;
  if (!validComparisonParams(state.kind,parameter,params,params)) throw new Error('Invalid comparison rule.');
  const origin = singleSnapshot(state), baseline = restoreSingle(origin).engine;
  const variant = restoreSingle(origin);
  variant.comparison = { parameter,origin,baseline };
  if (nudge) variant.engine.params[parameter] = suggestedValue(state.kind,parameter,params);
  return variant;
}

export function restartComparison(state, parameter = state.comparison.parameter) {
  const { origin } = state.comparison;
  const sameRule = parameter === state.comparison.parameter;
  const variant = forkComparison(restoreSingle(origin),parameter,!sameRule);
  if (sameRule) variant.engine.params[parameter] = state.engine.params[parameter];
  return variant;
}

export function worldFromRecipe(recipe) {
  const initialParams = recipe.comparison?.baseline || recipe.params;
  let state = { kind:recipe.kind,seed:recipe.seed,tick:0,engine:new engines[recipe.kind](recipe.seed,initialParams) };
  if (recipe.comparison) {
    state = forkComparison(state,recipe.comparison.parameter,false);
    state.engine.params = { ...recipe.params };
  }
  return state;
}
