// Version 2 keeps paired grids compact without losing any simulation precision.
// Explicit little-endian bytes make exports independent of machine byte order.
function encode(values, floats) {
  const bytes = new Uint8Array(values.length*(floats ? 4 : 1));
  const view = new DataView(bytes.buffer);
  for (let i = 0; i < values.length; i++) {
    if (floats) view.setFloat32(i*4,values[i],true);
    else bytes[i] = values[i];
  }
  let binary = '';
  for (let i = 0; i < bytes.length; i += 8192) binary += String.fromCharCode(...bytes.subarray(i,i+8192));
  return btoa(binary);
}

function decode(text, length, floats) {
  const size = length*(floats ? 4 : 1);
  if (typeof text !== 'string' || text.length !== 4*Math.ceil(size/3) || !/^[A-Za-z0-9+/]*={0,2}$/.test(text)) throw new Error('Invalid grid encoding.');
  const binary = atob(text);
  if (binary.length !== size) throw new Error('Invalid grid size.');
  const bytes = Uint8Array.from(binary,c => c.charCodeAt(0)), view = new DataView(bytes.buffer);
  return Array.from({ length },(_,i) => floats ? view.getFloat32(i*4,true) : bytes[i]);
}

export function packPart(kind, snapshot) {
  let encoding, data;
  if (kind === 'reaction') {
    encoding = 'float32-le-base64';
    data = { u:encode(snapshot.data.u,true),v:encode(snapshot.data.v,true) };
  } else if (kind === 'life') {
    encoding = 'uint8-base64'; data = { cells:encode(snapshot.data.cells,false) };
  } else { encoding = 'agents'; data = structuredClone(snapshot.data); }
  return { tick:snapshot.tick,params:{ ...snapshot.params },encoding,data };
}

export function unpackPart(kind, seed, part) {
  if (!part || !part.data || typeof part.data !== 'object') throw new Error('Missing field.');
  let data;
  if (kind === 'reaction' && part.encoding === 'float32-le-base64') {
    data = { u:decode(part.data.u,192*128,true),v:decode(part.data.v,192*128,true) };
  } else if (kind === 'life' && part.encoding === 'uint8-base64') {
    data = { cells:decode(part.data.cells,144*96,false) };
  } else if (kind === 'flock' && part.encoding === 'agents') data = part.data;
  else throw new Error('Unknown field encoding.');
  return { version:1,kind,seed,tick:part.tick,params:part.params,data };
}
