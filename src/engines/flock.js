import { random, clamp, wrap, delta } from '../random.js';

export class Flock {
  width = 960;
  height = 640;
  target = null;
  constructor(seed, params, { initialize = true } = {}) {
    this.params = { ...params };
    this.boids = [];
    if (!initialize) return;
    const rng = random(seed);
    this.boids = Array.from({ length: 200 }, () => {
      const angle = rng()*Math.PI*2;
      return { x: rng()*this.width, y: rng()*this.height, vx: Math.cos(angle)*params.speed, vy: Math.sin(angle)*params.speed };
    });
  }
  step() {
    const p = this.params, radius2 = p.perception*p.perception;
    // Read the old population, then commit every position simultaneously.
    this.boids = this.boids.map(b => {
      let sx = 0, sy = 0, ax = 0, ay = 0, cx = 0, cy = 0, count = 0;
      for (const other of this.boids) {
        if (b === other) continue;
        const dx = delta(b.x, other.x, this.width), dy = delta(b.y, other.y, this.height);
        const d2 = dx*dx + dy*dy;
        if (d2 < radius2) {
          count++; ax += other.vx; ay += other.vy; cx += dx; cy += dy;
          if (d2 < 24*24 && d2 > .0001) { sx -= dx/d2; sy -= dy/d2; }
        }
      }
      let fx = sx*p.separation*1.8, fy = sy*p.separation*1.8;
      if (count) {
        fx += (ax/count-b.vx)*.045*p.alignment + cx/count*.0015*p.cohesion;
        fy += (ay/count-b.vy)*.045*p.alignment + cy/count*.0015*p.cohesion;
      }
      if (this.target) {
        fx += delta(b.x, this.target.x, this.width)*.0008;
        fy += delta(b.y, this.target.y, this.height)*.0008;
      }
      let vx = b.vx + clamp(fx, -.22, .22), vy = b.vy + clamp(fy, -.22, .22);
      const length = Math.hypot(vx, vy);
      if (length > 1e-8) { vx = vx/length*p.speed; vy = vy/length*p.speed; }
      else { vx = p.speed; vy = 0; }
      return { x: wrap(b.x+vx, this.width), y: wrap(b.y+vy, this.height), vx, vy };
    });
  }
  paint(nx, ny) { this.target = { x: nx*this.width, y: ny*this.height }; }
  release() { this.target = null; }
  metrics() {
    let x = 0, y = 0;
    for (const b of this.boids) { const v = Math.hypot(b.vx,b.vy); x += b.vx/v; y += b.vy/v; }
    return [{ label: 'Travelers', value: String(this.boids.length) }, { label: 'Moving in unison', value: `${(Math.hypot(x,y)/this.boids.length*100).toFixed(1)}%` }];
  }
  snapshot() { return { boids: this.boids.map(b => ({ ...b })) }; }
  restore(data) { this.boids = data.boids.map(b => ({ ...b })); }
}
