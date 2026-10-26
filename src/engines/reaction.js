import { random, clamp, wrap } from '../random.js';

export class Reaction {
  width = 192;
  height = 128;
  constructor(seed, params) {
    this.params = { ...params };
    const n = this.width * this.height;
    this.u = new Float32Array(n).fill(1);
    this.v = new Float32Array(n);
    this.nextU = new Float32Array(n);
    this.nextV = new Float32Array(n);
    const rng = random(seed);
    for (let i = 0; i < 34; i++) this.paint(.08 + rng() * .84, .08 + rng() * .84, 2 + rng() * 5);
    // A mature starting field; user-visible ticks count from this initial condition.
    for (let i = 0; i < 480; i++) this.step();
  }

  step() {
    const w = this.width, h = this.height;
    const { feed, kill, diffusion } = this.params;
    const u = this.u, v = this.v, nu = this.nextU, nv = this.nextV;
    for (let y = 0; y < h; y++) {
      const up = ((y + h - 1) % h) * w, down = ((y + 1) % h) * w;
      for (let x = 0; x < w; x++) {
        const i = y * w + x, l = (x + w - 1) % w, r = (x + 1) % w;
        const lapU = -u[i] + .2 * (u[y*w+l] + u[y*w+r] + u[up+x] + u[down+x]) + .05 * (u[up+l] + u[up+r] + u[down+l] + u[down+r]);
        const lapV = -v[i] + .2 * (v[y*w+l] + v[y*w+r] + v[up+x] + v[down+x]) + .05 * (v[up+l] + v[up+r] + v[down+l] + v[down+r]);
        const reaction = u[i] * v[i] * v[i];
        nu[i] = clamp(u[i] + lapU - reaction + feed * (1 - u[i]), 0, 1);
        nv[i] = clamp(v[i] + diffusion * lapV + reaction - (feed + kill) * v[i], 0, 1);
      }
    }
    [this.u, this.nextU] = [nu, u];
    [this.v, this.nextV] = [nv, v];
  }

  paint(nx, ny, radius = 5) {
    const cx = Math.floor(nx * this.width), cy = Math.floor(ny * this.height);
    for (let dy = -Math.ceil(radius); dy <= radius; dy++) {
      for (let dx = -Math.ceil(radius); dx <= radius; dx++) {
        if (dx*dx + dy*dy > radius*radius) continue;
        const i = wrap(cy+dy, this.height)*this.width + wrap(cx+dx, this.width);
        this.u[i] = .45;
        this.v[i] = .6;
      }
    }
  }

  metrics() {
    let total = 0, active = 0;
    for (const v of this.v) { total += v; if (v > .12) active++; }
    return [{ label: 'Field coverage', value: `${(100*active/this.v.length).toFixed(1)}%` }, { label: 'Mean concentration', value: (total/this.v.length).toFixed(3) }];
  }
  snapshot() { return { u: Array.from(this.u), v: Array.from(this.v) }; }
  restore(data) { this.u.set(data.u); this.v.set(data.v); }
}
