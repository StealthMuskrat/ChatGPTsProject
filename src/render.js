import { clamp } from './random.js';

const stops = [[0,7,23,31],[.08,13,52,61],[.16,36,105,108],[.23,114,169,145],[.3,215,216,163],[.38,225,152,94],[.52,175,75,57],[1,247,216,162]];
const palette = Array.from({ length: 1024 }, (_, i) => {
  const v = i/1023;
  let index = 0;
  while (index < stops.length-2 && v > stops[index+1][0]) index++;
  const a = stops[index], b = stops[index+1], t = (v-a[0])/(b[0]-a[0]);
  return [1,2,3].map(c => Math.round(a[c]+t*(b[c]-a[c])));
});

export class Renderer {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d', { alpha: false });
    this.buffer = document.createElement('canvas');
    this.bctx = this.buffer.getContext('2d', { alpha: false });
  }
  draw(kind, engine) {
    const ctx = this.ctx, w = this.canvas.width, h = this.canvas.height;
    if (kind === 'reaction') {
      if (this.buffer.width !== engine.width || this.buffer.height !== engine.height) {
        this.buffer.width = engine.width; this.buffer.height = engine.height;
        this.pixels = this.bctx.createImageData(engine.width, engine.height);
      }
      const d = this.pixels.data;
      for (let i = 0; i < engine.v.length; i++) {
        const color = palette[clamp(Math.round(engine.v[i]*1023),0,1023)];
        d[i*4] = color[0]; d[i*4+1] = color[1]; d[i*4+2] = color[2]; d[i*4+3] = 255;
      }
      this.bctx.putImageData(this.pixels,0,0);
      ctx.imageSmoothingEnabled = true;
      ctx.drawImage(this.buffer,0,0,w,h);
    } else if (kind === 'life') {
      ctx.fillStyle = '#0c1924'; ctx.fillRect(0,0,w,h);
      const cw = w/engine.width, ch = h/engine.height;
      for (let i = 0; i < engine.cells.length; i++) {
        const age = engine.cells[i];
        if (!age) continue;
        const t = Math.min(1,age/32);
        ctx.fillStyle = `rgb(${Math.round(95+t*128)},${Math.round(133+t*73)},${Math.round(173+t*31)})`;
        ctx.fillRect((i%engine.width)*cw+.7,Math.floor(i/engine.width)*ch+.7,cw-1.4,ch-1.4);
      }
    } else {
      ctx.fillStyle = '#101f24'; ctx.fillRect(0,0,w,h);
      // A quiet coordinate field grounds the otherwise invisible space.
      ctx.fillStyle = '#a7bea51a';
      for (let y = 30; y < h; y += 40) for (let x = 30; x < w; x += 40) ctx.fillRect(x,y,1,1);
      for (let i = 0; i < engine.boids.length; i++) {
        const b = engine.boids[i], angle = Math.atan2(b.vy,b.vx);
        ctx.save(); ctx.translate(b.x,b.y); ctx.rotate(angle);
        const tail = 10 + (i%4)*3;
        const gradient = ctx.createLinearGradient(-tail,0,4,0);
        gradient.addColorStop(0,'#b5dda000'); gradient.addColorStop(1,'#b5dda05a');
        ctx.strokeStyle = gradient; ctx.lineWidth = 1;
        ctx.beginPath(); ctx.moveTo(-tail,0); ctx.lineTo(0,0); ctx.stroke();
        ctx.fillStyle = i%7 === 0 ? '#e7c286' : '#ccdfa7';
        ctx.beginPath(); ctx.moveTo(4.5,0); ctx.lineTo(-3.5,-2.1); ctx.lineTo(-1.7,0); ctx.lineTo(-3.5,2.1); ctx.closePath(); ctx.fill(); ctx.restore();
      }
      if (engine.target) {
        ctx.strokeStyle = '#d4eb9577'; ctx.lineWidth = 1;
        ctx.beginPath(); ctx.arc(engine.target.x,engine.target.y,17,0,Math.PI*2); ctx.stroke();
      }
    }
  }
}
