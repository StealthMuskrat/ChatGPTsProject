import { clamp, delta } from './random.js';

export const mapColors = {
  empty:[10,23,29], both:[51,75,65], aOnly:[239,170,108], bOnly:[112,210,224],
};
const stops = [[0,...mapColors.empty],[.1,32,73,84],[.35,72,139,137],[.65,214,215,154],[1,239,153,104]];

export function heatColor(value, gain = 1) {
  const t = clamp(value*gain,0,1);
  let i = 0;
  while (i < stops.length-2 && t > stops[i+1][0]) i++;
  const a = stops[i], b = stops[i+1], fraction = (t-a[0])/(b[0]-a[0]);
  return [1,2,3].map(c => Math.round(a[c]+fraction*(b[c]-a[c])));
}

export function chemicalDifferences(a,b) {
  return Float32Array.from(a.v,(value,i) => Math.abs(value-b.v[i]));
}

// Codes distinguish occupancy only: dead in both, alive in both, A only, B only.
export function lifeDifferences(a,b) {
  return Uint8Array.from(a.cells,(value,i) => value ? (b.cells[i] ? 1 : 2) : (b.cells[i] ? 3 : 0));
}

export function travelerDisplacements(a,b) {
  return a.boids.map((agent,i) => {
    const other = b.boids[i];
    const dx = delta(agent.x,other.x,a.width), dy = delta(agent.y,other.y,a.height);
    return { x:agent.x,y:agent.y,bx:other.x,by:other.y,dx,dy,distance:Math.hypot(dx,dy) };
  });
}

export function mapInfo(kind, baseline, gain) {
  if (kind === 'reaction') return {
    title:'Where chemistry diverges',
    description:'Each pixel shows |v in B − v in A| at the same site. Dark means no concentration difference. Warmer colors mean a larger absolute difference.',
    scale:`0 → ≥${(1/gain).toFixed(4)} Δv`,
    note:`Fixed linear scale at ${gain}× contrast. Values at or above ${(1/gain).toFixed(4)} share the warmest color. Contrast changes only this map; it does not change the measured difference or either field.`,
  };
  if (kind === 'life') return {
    title:'Where living cells disagree',
    description:'Amber cells live only in A; cyan cells live only in B. Muted green lives in both, and dark cells are dead in both. Age differences are excluded.',
    scale:'Amber: A only · Cyan: B only · Green: both alive · Dark: both dead',
    note:'These are categories, not a heat scale. An older cell and a newborn cell count as agreement when both are alive.',
  };
  const high = Math.hypot(baseline.width/2,baseline.height/2)/gain;
  return {
    title:'Where travelers part ways',
    description:'Amber rings mark A; cyan dots mark B. Each line connects the same traveler by its shortest wrapping path. Lines crossing an edge continue on the opposite side.',
    scale:`0 → ≥${high.toFixed(2)} world units`,
    note:`Line color measures distance on a fixed linear scale at ${gain}× contrast. Overlapping ring and dot means coincident positions. Paths compare traveler identity, not nearest neighbors; velocities are excluded.`,
  };
}

export class DifferenceRenderer {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d',{ alpha:false });
    this.buffer = document.createElement('canvas');
    this.bctx = this.buffer.getContext('2d',{ alpha:false });
  }

  draw(kind, a, b, gain = 4) {
    const ctx = this.ctx, width = this.canvas.width, height = this.canvas.height;
    if (kind === 'flock') {
      ctx.fillStyle = `rgb(${mapColors.empty})`; ctx.fillRect(0,0,width,height);
      const maxDistance = Math.hypot(a.width/2,a.height/2);
      const paths = travelerDisplacements(a,b);
      ctx.save(); ctx.scale(width/a.width,height/a.height);
      ctx.lineWidth = 1.1;
      for (const path of paths) {
        ctx.strokeStyle = `rgb(${heatColor(path.distance/maxDistance,gain)})`;
        // Repeat only visible segments so shortest paths remain continuous at seams.
        for (const ox of [-a.width,0,a.width]) for (const oy of [-a.height,0,a.height]) {
          const x = path.x+ox, y = path.y+oy, x2 = x+path.dx, y2 = y+path.dy;
          if (Math.max(x,x2) < 0 || Math.min(x,x2) > a.width || Math.max(y,y2) < 0 || Math.min(y,y2) > a.height) continue;
          ctx.beginPath(); ctx.moveTo(x,y); ctx.lineTo(x2,y2); ctx.stroke();
        }
      }
      for (const path of paths) {
        ctx.strokeStyle = `rgb(${mapColors.aOnly})`; ctx.lineWidth = 1;
        ctx.beginPath(); ctx.arc(path.x,path.y,2.3,0,Math.PI*2); ctx.stroke();
        ctx.fillStyle = `rgb(${mapColors.bOnly})`;
        ctx.beginPath(); ctx.arc(path.bx,path.by,1.3,0,Math.PI*2); ctx.fill();
      }
      ctx.restore();
      return;
    }
    if (this.buffer.width !== a.width || this.buffer.height !== a.height) {
      this.buffer.width = a.width; this.buffer.height = a.height;
      this.pixels = this.bctx.createImageData(a.width,a.height);
    }
    const values = kind === 'reaction' ? chemicalDifferences(a,b) : lifeDifferences(a,b);
    const categories = [mapColors.empty,mapColors.both,mapColors.aOnly,mapColors.bOnly];
    const pixels = this.pixels.data;
    for (let i = 0; i < values.length; i++) {
      const color = kind === 'reaction' ? heatColor(values[i],gain) : categories[values[i]];
      pixels[i*4] = color[0]; pixels[i*4+1] = color[1]; pixels[i*4+2] = color[2]; pixels[i*4+3] = 255;
    }
    this.bctx.putImageData(this.pixels,0,0);
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(this.buffer,0,0,width,height);
  }
}
