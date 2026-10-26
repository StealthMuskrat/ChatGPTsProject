import { catalog, defaults } from './catalog.js';
import { newSeed, readLink, linkHash, recipeOf, worldFromRecipe, forkComparison, restartComparison, snapshotOf, restoreSnapshot, validateSnapshot, MAX_IMPORT_BYTES } from './state.js';
import { comparisonControls, comparisonBounds, advanceWorld, paintWorld, releaseWorld, differenceMetric } from './comparison.js';
import { Renderer } from './render.js';
import { DifferenceRenderer, mapInfo } from './difference.js';

const $ = id => document.getElementById(id);
const storageKey = 'emergence-atlas.notebook.v1';
const canvas = $('field');
const baselineCanvas = $('field-baseline');
const renderer = new Renderer(canvas);
const baselineRenderer = new Renderer(baselineCanvas);
const differenceCanvas = $('difference-field');
const differenceRenderer = new DifferenceRenderer(differenceCanvas);
const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
let playing = !reducedMotion.matches;
let state, entries = [], toastTimer, lastTime = 0, debt = 0, dirty = true, lastMetrics = 0;
let pointer = null;
let storageWarning = '';
let showDifference = false, differenceGain = 4;

try {
  const saved = JSON.parse(localStorage.getItem(storageKey) || '[]');
  if (Array.isArray(saved)) entries = saved.slice(0,8).filter(e => e && typeof e.id === 'string' && typeof e.savedAt === 'string' && Number.isFinite(Date.parse(e.savedAt)) && validateSnapshot(e.snapshot));
} catch { storageWarning = 'Your notebook could not be loaded. You can still explore and export experiments.'; }

function toast(message) {
  clearTimeout(toastTimer);
  $('toast').textContent = message;
  $('toast').hidden = false;
  toastTimer = setTimeout(() => { $('toast').hidden = true; }, 4500);
}

function syncLink() {
  const hash = linkHash(recipeOf(state));
  try { history.replaceState(null, '', `${location.pathname}${location.search}#${hash}`); } catch { /* Sandboxed previews may not permit URL changes. */ }
}

function startWorld(kind, params = defaults(kind), seed = state?.seed ?? 41827) {
  adoptState(worldFromRecipe({ kind,params,seed }));
}

function adoptState(next) {
  releasePointer();
  state = next;
  debt = 0; dirty = true;
  syncUI(); syncLink(); draw();
}

function syncUI() {
  const info = catalog[state.kind];
  document.querySelectorAll('.world-card').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.world === state.kind)));
  $('world-family').textContent = `${info.number} / ${info.family}`;
  $('world-title').textContent = info.name;
  $('how-title').textContent = info.question;
  $('world-description').textContent = info.description;
  $('equation').textContent = info.equation;
  $('model-note').textContent = info.note;
  $('model-source').textContent = info.sourceLabel;
  $('model-source').href = info.source;
  $('interaction').textContent = info.interaction;
  $('canvas-tag').textContent = `LIVE FIELD / ${info.number}`;
  canvas.setAttribute('aria-label', `${info.name}. ${info.interaction} Press Enter to disturb the center. Space pauses time.`);
  $('seed').value = state.seed;
  $('controls').replaceChildren();
  for (const control of info.controls) {
    const el = document.createElement('div');
    el.className = 'control';
    const label = document.createElement('label'); label.htmlFor = `param-${control.key}`;
    const name = document.createElement('span'); name.textContent = control.label;
    const output = document.createElement('output'); output.htmlFor = label.htmlFor;
    const range = document.createElement('input');
    Object.assign(range, { type: 'range', id: label.htmlFor, min: control.min, max: control.max, step: control.step, value: state.engine.params[control.key] });
    const update = () => {
      output.value = format(Number(range.value), control);
      range.style.setProperty('--fill', `${100*(Number(range.value)-control.min)/(control.max-control.min)}%`);
    };
    range.addEventListener('input', () => {
      let v = Number(range.value);
      state.engine.params[control.key] = v;
      // Keep the survival interval coherent while still allowing either endpoint to move.
      if (state.kind === 'life' && control.key === 'surviveMin' && v > state.engine.params.surviveMax) {
        state.engine.params.surviveMax = v; syncRange('surviveMax',v);
      }
      if (state.kind === 'life' && control.key === 'surviveMax' && v < state.engine.params.surviveMin) {
        state.engine.params.surviveMin = v; syncRange('surviveMin',v);
      }
      update(); updatePreset(); syncLink(); dirty = true;
    });
    range.addEventListener('change', () => {
      if (control.restart) { startWorld(state.kind, state.engine.params); toast('A new grid, with your starting density.'); }
    });
    label.append(name,output);
    const bounds = document.createElement('div'); bounds.className = 'bounds';
    const lo = document.createElement('span'); lo.textContent = format(control.min,control);
    const hi = document.createElement('span'); hi.textContent = format(control.max,control);
    bounds.append(lo,hi); el.append(label,range,bounds); $('controls').append(el); update();
  }
  $('preset').replaceChildren();
  const custom = new Option('Your own world', 'custom'); custom.disabled = true; $('preset').add(custom);
  info.presets.forEach((p,i) => $('preset').add(new Option(p.name,String(i))));
  updatePreset(); syncComparisonUI(); updatePlaying(); updateMetrics();
}

function syncComparisonUI() {
  const comparison = state.comparison, active = !!comparison;
  $('field-pair').classList.toggle('comparing',active);
  $('metrics').classList.toggle('comparison-metrics',active);
  for (const id of ['baseline-world','variant-caption','comparison-controls','comparison-note']) $(id).hidden = !active;
  $('controls').hidden = active; $('presets').hidden = active;
  $('seed').disabled = active; $('shuffle').disabled = active;
  $('compare').setAttribute('aria-pressed',String(active));
  $('compare').textContent = active ? '↳ Keep variant' : '⇄ Compare two futures';
  $('compare-invitation').textContent = active ? 'Same moment. One rule apart.' : 'One beginning. A different possibility.';
  $('compare-invitation').hidden = active;
  if (!active) showDifference = false;
  syncDifferenceUI();
  $('reset').setAttribute('aria-label',active ? 'Restart both from the fork' : 'Restart from seed');
  $('reset').title = active ? 'Restart both from the fork (R)' : 'Restart from seed (R)';
  $('seed-note').textContent = active ? 'Shared seed. Reset returns both to the fork.' : 'Same seed. Same beginning.';
  document.querySelector('.inspector-heading h3').textContent = active ? 'Change one possibility' : 'Shape this world';
  $('canvas-tag').textContent = active ? 'B / VARIED RULE' : `LIVE FIELD / ${catalog[state.kind].number}`;
  if (!active) return;
  $('interaction').textContent = 'Draw on either field. The same disturbance reaches both futures.';
  $('comparison-note').textContent = `Forked together at tick ${comparison.origin.tick.toLocaleString()}. Both clocks and every brush stroke stay synchronized. Reset returns to this fork.`;
  baselineCanvas.setAttribute('aria-label',`Baseline A: ${catalog[state.kind].name}. Drawing and Enter affect both fields. Space pauses both.`);
  canvas.setAttribute('aria-label',`Variant B: ${catalog[state.kind].name}. Drawing and Enter affect both fields. Space pauses both.`);
  $('compare-parameter').replaceChildren(...comparisonControls(state.kind).map(c => new Option(c.label,c.key)));
  $('compare-parameter').value = comparison.parameter;
  const c = comparisonBounds(state.kind,comparison.parameter,comparison.baseline.params);
  Object.assign($('compare-value'),{ min:c.min,max:c.max,step:c.step,value:state.engine.params[c.key] });
  $('compare-value').setAttribute('aria-label',`Variant B: ${c.label}`);
  $('compare-min').textContent = format(c.min,c); $('compare-max').textContent = format(c.max,c);
  $('difference-explanation').textContent = {
    reaction:'Difference measures the mean absolute change in chemical v, from 0 to 1. A zero value can become nonzero after the next tick.',
    life:'Difference is the percentage of cells alive in only one field. Cell age affects brightness but does not count as disagreement.',
    flock:'Difference is the mean shortest wrapping distance between corresponding travelers. Direction differences can appear before positions separate.',
  }[state.kind];
  syncComparisonReadout();
}

function syncDifferenceUI() {
  const active = !!state.comparison;
  $('difference-toggle').hidden = !active;
  $('difference-toggle').setAttribute('aria-pressed',String(active && showDifference));
  $('difference-toggle').textContent = showDifference ? 'Δ Hide difference map' : 'Δ Show difference map';
  $('difference-panel').hidden = !active || !showDifference;
  if (!active) return;
  const info = mapInfo(state.kind,state.comparison.baseline,differenceGain);
  $('difference-title').textContent = info.title;
  $('difference-description').textContent = info.description;
  $('difference-scale').textContent = info.scale;
  $('difference-note').textContent = info.note;
  $('difference-gain-label').hidden = state.kind === 'life';
  $('difference-categories').hidden = state.kind !== 'life';
  $('difference-gradient').hidden = state.kind === 'life';
  differenceCanvas.setAttribute('aria-label',`${info.title}. Read-only map; Space pauses both worlds.`);
}

$('difference-toggle').addEventListener('click', () => {
  if (!state.comparison) return;
  showDifference = !showDifference;
  syncDifferenceUI(); draw(); updateMetrics();
});
$('difference-gain').addEventListener('change', () => {
  differenceGain = Number($('difference-gain').value);
  syncDifferenceUI(); draw();
});
$('export-difference').addEventListener('click', () => {
  if (!state.comparison) return;
  draw();
  const info = mapInfo(state.kind,state.comparison.baseline,differenceGain);
  const image = document.createElement('canvas'); image.width = 960; image.height = 768;
  const ctx = image.getContext('2d'); ctx.fillStyle = '#111916'; ctx.fillRect(0,0,image.width,image.height);
  ctx.fillStyle = '#d4eb95'; ctx.font = '18px monospace'; ctx.fillText(info.title,16,28);
  ctx.fillStyle = '#eceee2'; ctx.font = '12px monospace'; ctx.fillText(info.scale,16,51);
  if (state.kind !== 'life') {
    const gradient = ctx.createLinearGradient(640,0,944,0);
    for (const [at,color] of [[0,'#0a171d'],[.1,'#204954'],[.35,'#488b89'],[.65,'#d6d79a'],[1,'#ef9968']]) gradient.addColorStop(at,color);
    ctx.fillStyle = gradient; ctx.fillRect(640,16,304,9);
  }
  ctx.drawImage(differenceCanvas,0,66);
  ctx.fillStyle = '#9aa698'; ctx.font = '11px monospace';
  ctx.fillText(`EMERGENCE ATLAS / SEED ${state.seed} / TICK ${state.tick} / ${state.kind === 'life' ? 'OCCUPANCY ONLY' : `DISPLAY CONTRAST ${differenceGain}x; UPPER SCALE CLIPS`}`,16,730);
  if (state.kind === 'flock') ctx.fillText('AMBER RINGS: A / CYAN DOTS: B / SHORTEST WRAPPING PATHS / POSITIONS ONLY',16,751);
  if (state.kind === 'reaction') ctx.fillText('ABSOLUTE DIFFERENCE IN CHEMICAL v / DARK: ZERO / WARM: UPPER SCALE OR GREATER',16,751);
  const filename = `atlas-${state.kind}-${state.seed}-${state.tick}-difference.png`;
  image.toBlob(blob => { if (blob) { download(blob,filename); toast('Difference map exported with its scale.'); } },'image/png');
});

function syncComparisonReadout() {
  const { parameter,baseline } = state.comparison;
  const c = comparisonBounds(state.kind,parameter,baseline.params);
  const a = format(baseline.params[parameter],c), b = format(state.engine.params[parameter],c);
  $('baseline-rule').textContent = `${c.label}: ${a}`;
  $('variant-rule').textContent = `${c.label}: ${b}`;
  $('compare-baseline').value = a; $('compare-output').value = b;
  $('compare-value').style.setProperty('--fill',`${c.max === c.min ? 0 : 100*(state.engine.params[parameter]-c.min)/(c.max-c.min)}%`);
}

function restartWorld() {
  if (state.comparison) { adoptState(restartComparison(state)); toast('Both futures returned to their shared fork.'); }
  else { startWorld(state.kind,state.engine.params); toast('Back to the beginning. Same seed, same rules.'); }
}

$('compare').addEventListener('click', () => {
  releasePointer();
  if (state.comparison) {
    const next = { ...state }; delete next.comparison; adoptState(next);
    toast('Continuing with B. Its field and rules are preserved.');
  } else {
    playing = false;
    const parameter = { reaction:'feed',flock:'alignment',life:'birth' }[state.kind];
    adoptState(forkComparison(state,parameter));
    $('compare-value').focus();
    toast('Two identical fields, one different rule. Press Play or Step to see what changes.');
  }
});
$('compare-parameter').addEventListener('change', () => {
  if (!state.comparison) return;
  adoptState(restartComparison(state,$('compare-parameter').value));
  $('compare-parameter').focus();
  toast('A new question, from the same shared fork.');
});
$('compare-value').addEventListener('input', () => {
  if (!state.comparison) return;
  state.engine.params[state.comparison.parameter] = Number($('compare-value').value);
  syncComparisonReadout(); syncLink(); dirty = true;
});

function format(value,control) {
  if (control.step >= 1) return String(value);
  const decimals = control.step === .001 ? 3 : control.step === .01 ? 2 : 1;
  return value.toFixed(decimals);
}

function syncRange(key,value) {
  const input = $(`param-${key}`), c = catalog[state.kind].controls.find(c => c.key === key);
  input.value = value;
  input.style.setProperty('--fill', `${100*(value-c.min)/(c.max-c.min)}%`);
  input.parentElement.querySelector('output').value = format(value,c);
}

function updatePreset() {
  const index = catalog[state.kind].presets.findIndex(p => Object.entries(p.params).every(([k,v]) => Math.abs(state.engine.params[k]-v) < 1e-8));
  $('preset').value = index < 0 ? 'custom' : String(index);
  $('preset-hint').textContent = index < 0 ? 'An experiment all your own' : catalog[state.kind].presets[index].hint;
}

function updatePlaying() {
  $('play').replaceChildren(document.createTextNode(playing ? 'Ⅱ ' : '▷ '));
  const text = document.createElement('span'); text.textContent = playing ? 'Pause' : 'Play'; $('play').append(text);
  $('play').title = playing ? 'Pause (Space)' : 'Play (Space)';
  $('play').setAttribute('aria-label', playing ? 'Pause simulation' : 'Play simulation');
  $('paused-overlay').hidden = playing;
  $('live-status').classList.toggle('paused',!playing);
  $('live-status').replaceChildren(document.createElement('i'),document.createTextNode(playing ? ' UNFOLDING' : ' TIME IS STILL'));
  debt = 0;
}

function updateMetrics() {
  $('tick').textContent = String(state.tick).padStart(6,'0');
  const variantMetrics = state.engine.metrics();
  const baselineMetrics = state.comparison?.baseline.metrics();
  const index = state.kind === 'flock' ? 1 : 0;
  const metrics = state.comparison ? [
    { ...baselineMetrics[index],label:`A · ${baselineMetrics[index].label}` },
    { ...variantMetrics[index],label:`B · ${variantMetrics[index].label}` },
    differenceMetric(state.kind,state.comparison.baseline,state.engine),
  ] : [...variantMetrics, { label: 'Boundary', value: 'WRAPS AT EDGES' }];
  $('metrics').replaceChildren(...metrics.map(m => {
    const el = document.createElement('div'); el.className = 'metric';
    const label = document.createElement('span'); label.textContent = m.label;
    const value = document.createElement('b'); value.textContent = m.value;
    el.append(label,value); return el;
  }));
  if (state.comparison && showDifference) {
    const difference = metrics[2];
    $('difference-summary').textContent = `${difference.label}: ${difference.value} · Tick ${state.tick.toLocaleString()}`;
  }
}

function tick(count = 1) {
  advanceWorld(state,count);
  dirty = true;
}
function draw() {
  renderer.draw(state.kind,state.engine);
  if (state.comparison) baselineRenderer.draw(state.kind,state.comparison.baseline);
  if (state.comparison && showDifference) differenceRenderer.draw(state.kind,state.comparison.baseline,state.engine,differenceGain);
  dirty = false;
}

function frame(now) {
  const elapsed = Math.min(100, now-(lastTime || now)); lastTime = now;
  if (playing && !document.hidden) {
    debt += elapsed * Number($('tempo').value);
    let batches = 0;
    while (debt >= 1000/30 && batches < 12) {
      tick({ reaction: 6, flock: 2, life: 1 }[state.kind]);
      debt -= 1000/30; batches++;
    }
  }
  if (dirty) draw();
  if (now-lastMetrics > 250) { updateMetrics(); lastMetrics = now; }
  requestAnimationFrame(frame);
}

for (const [key, info] of Object.entries(catalog)) {
  const card = document.createElement('button');
  card.type = 'button'; card.className = 'world-card'; card.dataset.world = key;
  card.setAttribute('aria-pressed','false');
  // All markup here comes from the static catalog, never from imported data.
  card.innerHTML = `<span class="world-number">WORLD ${info.number}<span class="arrow" aria-hidden="true">↗</span></span><span class="world-mark ${key}" aria-hidden="true"></span><h3>${info.name}</h3><p>${info.family}</p>`;
  card.addEventListener('click', () => startWorld(key));
  $('world-list').append(card);
}

$('preset').addEventListener('change', () => {
  const preset = catalog[state.kind].presets[Number($('preset').value)];
  if (preset) startWorld(state.kind,preset.params);
});
$('play').addEventListener('click', () => { playing = !playing; updatePlaying(); });
$('step').addEventListener('click', () => { playing = false; updatePlaying(); tick(); draw(); updateMetrics(); });
$('reset').addEventListener('click',restartWorld);
$('shuffle').addEventListener('click', () => startWorld(state.kind,state.engine.params,newSeed()));
$('seed').addEventListener('change', () => {
  const seed = Number($('seed').value);
  if ($('seed').value.trim() && Number.isInteger(seed) && seed >= 0 && seed <= 4294967295) startWorld(state.kind,state.engine.params,seed);
  else { $('seed').value = state.seed; toast('Choose a whole-number seed between 0 and 4,294,967,295.'); }
});

function disturb(event) {
  const r = event.currentTarget.getBoundingClientRect();
  const x = Math.max(0,Math.min(.999999,(event.clientX-r.left)/r.width));
  const y = Math.max(0,Math.min(.999999,(event.clientY-r.top)/r.height));
  // Interpolation keeps quick brush strokes continuous on a sparse event stream.
  if (pointer?.last && state.kind !== 'flock') {
    const dist = Math.hypot((x-pointer.last.x)*192,(y-pointer.last.y)*128);
    const n = Math.max(1,Math.ceil(dist/2));
    for (let i = 1; i <= n; i++) paintWorld(state,pointer.last.x+(x-pointer.last.x)*i/n,pointer.last.y+(y-pointer.last.y)*i/n);
  } else paintWorld(state,x,y);
  if (pointer) pointer.last = { x,y };
  dirty = true;
}
function releasePointer() {
  if (pointer && pointer.canvas.hasPointerCapture(pointer.id)) pointer.canvas.releasePointerCapture(pointer.id);
  pointer = null;
  releaseWorld(state);
  dirty = true;
}
for (const field of [canvas,baselineCanvas]) {
  field.addEventListener('pointerdown', e => {
    if (!e.isPrimary || e.button !== 0) return;
    field.focus({ preventScroll: true }); field.setPointerCapture(e.pointerId);
    pointer = { id: e.pointerId, last: null,canvas:field }; disturb(e);
  });
  field.addEventListener('pointermove', e => { if (pointer?.id === e.pointerId) disturb(e); });
  field.addEventListener('pointerup',releasePointer);
  field.addEventListener('pointercancel',releasePointer);
  field.addEventListener('lostpointercapture',releasePointer);
  field.addEventListener('keydown', e => {
    if (e.key !== 'Enter') return;
    e.preventDefault(); paintWorld(state,.5,.5);
    if (state.kind === 'flock') { tick(); releaseWorld(state); }
    dirty = true; toast('A small disturbance at the center of the world.');
  });
}
window.addEventListener('blur',releasePointer);
document.addEventListener('visibilitychange', () => { lastTime = 0; debt = 0; releasePointer(); });
document.addEventListener('keydown', e => {
  if (e.repeat || e.ctrlKey || e.altKey || e.metaKey || e.target.closest('input,select,textarea,button,a,summary') || document.querySelector('dialog[open]')) return;
  if (e.code === 'Space') { e.preventDefault(); playing = !playing; updatePlaying(); }
  if (e.key.toLowerCase() === 'r') restartWorld();
});
reducedMotion.addEventListener('change', e => { if (e.matches) { playing = false; updatePlaying(); } });

function download(blob,name) {
  const url = URL.createObjectURL(blob), a = document.createElement('a');
  a.href = url; a.download = name; a.click();
  setTimeout(() => URL.revokeObjectURL(url),1000);
}
$('export-image').addEventListener('click', () => {
  draw();
  let image = canvas;
  const filename = `atlas-${state.kind}-${state.seed}-${state.tick}${state.comparison ? '-comparison' : ''}.png`;
  if (state.comparison) {
    image = document.createElement('canvas'); image.width = 1968; image.height = 720;
    const ctx = image.getContext('2d'); ctx.fillStyle = '#111916'; ctx.fillRect(0,0,image.width,image.height);
    ctx.fillStyle = '#d4eb95'; ctx.font = '16px monospace';
    ctx.fillText(`A / ${$('baseline-rule').textContent}`,16,35); ctx.fillText(`B / ${$('variant-rule').textContent}`,992,35);
    ctx.drawImage(baselineCanvas,16,56); ctx.drawImage(canvas,992,56);
    ctx.fillStyle = '#9aa698'; ctx.font = '12px monospace';
    ctx.fillText(`EMERGENCE ATLAS / ${catalog[state.kind].name} / SEED ${state.seed} / TICK ${state.tick} / FORK ${state.comparison.origin.tick}`,16,712);
  }
  image.toBlob(blob => {
    if (blob) { download(blob,filename); toast('Field image exported.'); }
    else toast('Image export was unavailable. Try exporting the experiment instead.');
  },'image/png');
});
$('share').addEventListener('click', async () => {
  syncLink();
  if (location.protocol === 'file:') {
    toast('This is a local file. Export a notebook moment to share it, or host the HTML to use recipe links.');
    return;
  }
  const message = state.comparison ? 'Comparison recipe copied. Both begin from A’s seed. Export a paired moment to preserve this exact fork.' : 'Recipe link copied. It recreates this beginning; export a moment to preserve its exact state.';
  try { await navigator.clipboard.writeText(location.href); toast(message); }
  catch { toast('Your recipe is in the address bar. Copy the URL to share its beginning.'); }
});

function writeEntries(next) {
  try { localStorage.setItem(storageKey,JSON.stringify(next)); entries = next; refreshNotebook(); return true; }
  catch { toast('The notebook could not be saved. Storage may be full or disabled. Export this moment instead.'); return false; }
}
function keep(snapshot) {
  if (entries.length >= 8) { toast('Your notebook has eight moments. Export or remove one to make room.'); return false; }
  const entry = { id: crypto.randomUUID(), savedAt: new Date().toISOString(), snapshot };
  return writeEntries([entry,...entries]);
}
$('save').addEventListener('click', () => {
  const snapshot = snapshotOf(state);
  if (keep(snapshot)) toast('Moment kept in your field notebook.');
  else {
    // Always provide a way out when persistence is unavailable.
    download(new Blob([JSON.stringify(snapshot)],{ type:'application/json' }),`atlas-${state.kind}-${state.seed}-${state.tick}.json`);
  }
});
function refreshNotebook() {
  $('saved-count').textContent = entries.length;
  $('notebook-entries').replaceChildren();
  if (!entries.length) {
    const empty = document.createElement('p'); empty.className = 'empty-notebook';
    empty.textContent = 'Every discovery starts with a little curiosity.';
    const hint = document.createElement('span'); hint.textContent = 'Keep a moment from any world, or import an experiment.'; empty.append(hint);
    $('notebook-entries').append(empty); return;
  }
  for (const entry of entries) {
    const s = entry.snapshot, el = document.createElement('article'); el.className = 'notebook-entry';
    const heading = document.createElement('div'); heading.className = 'entry-title';
    const title = document.createElement('h3'); title.textContent = `${catalog[s.kind].name}${s.version === 2 ? ' · Two futures' : ''}`;
    const date = document.createElement('span'); date.textContent = new Date(entry.savedAt).toLocaleString(undefined,{ month:'short',day:'numeric',hour:'numeric',minute:'2-digit' }); heading.append(title,date);
    const meta = document.createElement('p'); meta.textContent = `SEED ${s.seed} / TICK ${s.tick.toLocaleString()}${s.version === 2 ? ` / VARIED: ${catalog[s.kind].controls.find(c => c.key === s.parameter).label.toUpperCase()}` : ''}`;
    const actions = document.createElement('div'); actions.className = 'entry-actions';
    const restore = document.createElement('button'); restore.type = 'button'; restore.textContent = 'Restore moment';
    restore.addEventListener('click', () => {
      releasePointer(); state = restoreSnapshot(s); playing = false; debt = 0; dirty = true;
      syncUI(); syncLink(); draw(); $('notebook').close(); toast('Moment restored. Time is paused until you press Play.');
    });
    const exp = document.createElement('button'); exp.type = 'button'; exp.textContent = 'Export';
    exp.addEventListener('click', () => download(new Blob([JSON.stringify(s)],{ type:'application/json' }),`atlas-${s.kind}-${s.seed}-${s.tick}.json`));
    const remove = document.createElement('button'); remove.type = 'button'; remove.textContent = 'Remove';
    remove.addEventListener('click', () => {
      const previous = entries;
      if (writeEntries(entries.filter(e => e.id !== entry.id))) {
        toast('Moment removed from this notebook.');
        // Move focus somewhere stable when the active entry disappears.
        $('import-open').focus();
      } else entries = previous;
    });
    actions.append(restore,exp,remove); el.append(heading,meta,actions); $('notebook-entries').append(el);
  }
}
$('notebook-open').addEventListener('click', () => { refreshNotebook(); $('notebook').showModal(); });
$('about-open').addEventListener('click', () => $('about').showModal());
document.querySelectorAll('[data-close]').forEach(b => b.addEventListener('click', () => b.closest('dialog').close()));
$('import-open').addEventListener('click', () => $('import-file').click());
$('import-file').addEventListener('change', async e => {
  const file = e.target.files[0];
  e.target.value = '';
  if (!file) return;
  if (file.size > MAX_IMPORT_BYTES) { toast('That file is too large. Choose an Atlas JSON export smaller than 8 MB.'); return; }
  try {
    const s = JSON.parse(await file.text());
    if (!validateSnapshot(s)) throw new Error('Invalid experiment');
    if (keep(s)) toast('Experiment imported. Restore the moment when you’re ready.');
  } catch { toast('That file is not a valid Atlas experiment (versions 1 and 2). Nothing was changed.'); }
});
document.querySelectorAll('a[href="#workspace"]').forEach(a => a.addEventListener('click', e => {
  e.preventDefault(); $('workspace').scrollIntoView({ behavior: reducedMotion.matches ? 'instant' : 'smooth' }); canvas.focus({ preventScroll: true });
}));
window.addEventListener('hashchange', () => {
  if (!location.hash.includes('world=')) return;
  const recipe = readLink(location.hash);
  if (recipe) adoptState(worldFromRecipe(recipe));
  else toast('This recipe link is invalid. Your current world is unchanged.');
});

const initial = readLink(location.hash);
adoptState(worldFromRecipe(initial || { kind:'reaction',params:defaults('reaction'),seed:41827 }));
refreshNotebook();
if (storageWarning) toast(storageWarning);
else if (!initial) toast('This recipe link was invalid, so a fresh chemical garden was opened.');
requestAnimationFrame(frame);
