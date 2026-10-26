import { catalog, defaults, validParams } from './catalog.js';
import { Reaction } from './engines/reaction.js';
import { Life } from './engines/life.js';
import { Flock } from './engines/flock.js';

export const engines = { reaction: Reaction, life: Life, flock: Flock };
export const MAX_IMPORT_BYTES = 3_000_000;
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
    return { kind, seed, params };
  } catch { return null; }
}

export function linkHash({ kind, seed, params }) {
  return new URLSearchParams({ world: kind, seed: String(seed), params: JSON.stringify(params) }).toString();
}

const validSeed = s => Number.isInteger(s) && s >= 0 && s <= 4294967295;
const arrayOf = (a, length, check) => Array.isArray(a) && a.length === length && a.every(check);
const unit = x => typeof x === 'number' && Number.isFinite(x) && x >= 0 && x <= 1;

export function validateSnapshot(s) {
  if (!s || s.version !== 1 || !Object.hasOwn(engines, s.kind) || !validSeed(s.seed) || !validParams(s.kind, s.params)) return false;
  if (!Number.isSafeInteger(s.tick) || s.tick < 0 || s.tick > 1e12) return false;
  const d = s.data;
  if (!d || typeof d !== 'object') return false;
  if (s.kind === 'reaction') return arrayOf(d.u, 192*128, unit) && arrayOf(d.v, 192*128, unit);
  if (s.kind === 'life') return arrayOf(d.cells, 144*96, x => Number.isInteger(x) && x >= 0 && x <= 255);
  return arrayOf(d.boids, 200, b => b && typeof b === 'object' && ['x','y','vx','vy'].every(k => typeof b[k] === 'number' && Number.isFinite(b[k])) &&
    b.x >= 0 && b.x < 960 && b.y >= 0 && b.y < 640 && Math.hypot(b.vx,b.vy) > 0 && Math.hypot(b.vx,b.vy) <= 5.001);
}

export function snapshotOf(state) {
  return { version: 1, kind: state.kind, seed: state.seed, params: { ...state.engine.params }, tick: state.tick, data: state.engine.snapshot() };
}

export function restoreSnapshot(snapshot) {
  if (!validateSnapshot(snapshot)) throw new Error('This is not a valid Emergence Atlas experiment (version 1).');
  const engine = new engines[snapshot.kind](snapshot.seed, snapshot.params);
  engine.restore(snapshot.data);
  return { kind: snapshot.kind, seed: snapshot.seed, tick: snapshot.tick, engine };
}
