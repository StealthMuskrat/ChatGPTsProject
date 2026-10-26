import { catalog, validParams } from './catalog.js';
import { delta } from './random.js';

export const comparisonControls = kind => catalog[kind].controls.filter(c => !c.restart);

export function validComparisonParams(kind, parameter, baseline, variant) {
  if (!validParams(kind,baseline) || !validParams(kind,variant)) return false;
  return comparisonControls(kind).some(c => c.key === parameter) &&
    Object.keys(baseline).every(key => key === parameter || baseline[key] === variant[key]);
}

export function comparisonBounds(kind, parameter, params) {
  const control = comparisonControls(kind).find(c => c.key === parameter);
  if (!control) throw new Error('Choose a rule that can change during a simulation.');
  return { ...control,
    min: parameter === 'surviveMax' ? Math.max(control.min,params.surviveMin) : control.min,
    max: parameter === 'surviveMin' ? Math.min(control.max,params.surviveMax) : control.max,
  };
}

export function suggestedValue(kind, parameter, params) {
  const c = comparisonBounds(kind,parameter,params);
  const amount = c.step * (c.step < .01 ? 4 : c.step < 1 ? 3 : 1);
  const current = params[parameter];
  const value = current+amount <= c.max ? current+amount : Math.max(c.min,current-amount);
  return Number(value.toFixed(6));
}

export function advanceWorld(state, count = 1) {
  for (let i = 0; i < count; i++) {
    state.comparison?.baseline.step();
    state.engine.step();
    state.tick++;
  }
}

export function paintWorld(state, x, y) {
  state.comparison?.baseline.paint(x,y);
  state.engine.paint(x,y);
}

export function releaseWorld(state) {
  state?.engine.release?.();
  state?.comparison?.baseline.release?.();
}

export function differenceMetric(kind, baseline, variant) {
  if (kind === 'reaction') {
    let sum = 0;
    for (let i = 0; i < baseline.v.length; i++) sum += Math.abs(baseline.v[i]-variant.v[i]);
    return { label:'Mean Δ concentration',value:`${(sum/baseline.v.length).toFixed(4)}` };
  }
  if (kind === 'life') {
    let changed = 0;
    for (let i = 0; i < baseline.cells.length; i++) if (!!baseline.cells[i] !== !!variant.cells[i]) changed++;
    return { label:'Cells that disagree',value:`${(100*changed/baseline.cells.length).toFixed(1)}%` };
  }
  let distance = 0;
  for (let i = 0; i < baseline.boids.length; i++) {
    const a = baseline.boids[i], b = variant.boids[i];
    distance += Math.hypot(delta(a.x,b.x,baseline.width),delta(a.y,b.y,baseline.height));
  }
  return { label:'Mean traveler distance',value:`${(distance/baseline.boids.length).toFixed(2)} units` };
}
