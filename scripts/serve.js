import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { resolve, extname, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..',import.meta.url));
const port = Number(process.env.PORT || 3000);
const types = { '.html':'text/html; charset=utf-8', '.js':'text/javascript; charset=utf-8', '.css':'text/css; charset=utf-8', '.svg':'image/svg+xml', '.json':'application/json', '.png':'image/png', '.md':'text/plain; charset=utf-8' };
createServer(async (req,res) => {
  try {
    if (!['GET','HEAD'].includes(req.method)) { res.writeHead(405,{ Allow:'GET, HEAD' }); res.end(); return; }
    const path = decodeURIComponent(new URL(req.url,'http://localhost').pathname);
    if (path.split('/').some(p => p.startsWith('.'))) throw new Error('Hidden path');
    let file = resolve(root,`.${path}`);
    if (!file.startsWith(root.endsWith(sep) ? root : root+sep)) throw new Error('Invalid path');
    if ((await stat(file)).isDirectory()) file = resolve(file,'index.html');
    const content = await readFile(file);
    res.writeHead(200,{ 'Content-Type':types[extname(file)] || 'application/octet-stream', 'Cache-Control':'no-store', 'X-Content-Type-Options':'nosniff' });
    res.end(req.method === 'HEAD' ? undefined : content);
  } catch { res.writeHead(404,{ 'Content-Type':'text/plain' }); res.end('Not found'); }
}).listen(port,'127.0.0.1',() => console.log(`Emergence Atlas → http://localhost:${port}`));
