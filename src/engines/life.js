import { random, wrap } from '../random.js';

export class Life {
  width = 144;
  height = 96;
  constructor(seed, params, { initialize = true } = {}) {
    this.params = { ...params };
    this.cells = new Uint8Array(this.width*this.height);
    this.next = new Uint8Array(this.cells.length);
    if (!initialize) return;
    const rng = random(seed);
    for (let i = 0; i < this.cells.length; i++) this.cells[i] = rng() < params.density ? 1 : 0;
  }
  step() {
    const w = this.width, h = this.height, c = this.cells, n = this.next;
    const { birth, surviveMin, surviveMax } = this.params;
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      let count = 0;
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        if (dx || dy) count += c[wrap(y+dy, h)*w+wrap(x+dx, w)] > 0 ? 1 : 0;
      }
      const i = y*w+x;
      n[i] = c[i] ? (count >= surviveMin && count <= surviveMax ? Math.min(255, c[i]+1) : 0) : (count === birth ? 1 : 0);
    }
    [this.cells, this.next] = [n, c];
  }
  paint(nx, ny, radius = 2) {
    const cx = Math.floor(nx*this.width), cy = Math.floor(ny*this.height);
    for (let dy = -radius; dy <= radius; dy++) for (let dx = -radius; dx <= radius; dx++) {
      if (dx*dx+dy*dy <= radius*radius) this.cells[wrap(cy+dy, this.height)*this.width+wrap(cx+dx, this.width)] = 1;
    }
  }
  metrics() {
    let alive = 0, age = 0;
    for (const c of this.cells) if (c) { alive++; age += c; }
    return [{ label: 'Living cells', value: alive.toLocaleString() }, { label: 'Mean cell age', value: alive ? (age/alive).toFixed(1) : '0' }];
  }
  snapshot() { return { cells: Array.from(this.cells) }; }
  restore(data) { this.cells.set(data.cells); }
}
