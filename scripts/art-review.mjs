// Art-review gallery — a zero-dependency local server for the Claude Code browser pane.
// Serves a newest-first, auto-refreshing grid of recent renders so curation iterations are
// visible live (no file navigation). Read-only; binds to localhost only.

import * as fs from 'node:fs';
import * as http from 'node:http';
import * as path from 'node:path';

const PORT = 8787;
/** Only files under these roots are ever listed or served. */
const ROOTS = [
  'D:\\Workbench\\LOCAL\\LocalAI\\output',
  'D:\\Workbench\\FVTT\\Repos\\fvtt-campaign-greenrest\\art',
];
const MAX_IMAGES = 12;

function listNewest() {
  const files = [];
  for (const root of ROOTS) {
    let entries = [];
    try {
      entries = fs.readdirSync(root, { recursive: true });
    } catch {
      continue;
    }
    for (const rel of entries) {
      if (!/\.(png|webp|jpe?g)$/i.test(String(rel))) continue;
      const full = path.join(root, String(rel));
      try {
        const stat = fs.statSync(full);
        if (stat.isFile()) files.push({ full, mtime: stat.mtimeMs, size: stat.size });
      } catch {
        /* raced deletion */
      }
    }
  }
  files.sort((a, b) => b.mtime - a.mtime);
  return files.slice(0, MAX_IMAGES);
}

function isAllowed(p) {
  const resolved = path.resolve(p);
  return ROOTS.some(root => resolved.toLowerCase().startsWith(root.toLowerCase() + path.sep));
}

const PAGE = `<!doctype html><meta charset="utf-8"><title>Art review</title>
<style>
  body{margin:0;background:#15171c;color:#ccc;font:13px system-ui}
  .grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(340px,1fr));gap:10px;padding:10px}
  figure{margin:0;background:#1e2128;border-radius:8px;overflow:hidden}
  img{width:100%;height:auto;display:block;cursor:zoom-in}
  figcaption{padding:6px 9px;word-break:break-all;opacity:.8}
  .zoom{position:fixed;inset:0;background:rgba(0,0,0,.93);display:none;align-items:center;justify-content:center;cursor:zoom-out}
  .zoom img{max-width:100vw;max-height:100vh;width:auto;height:auto}
  .zoom.on{display:flex}
</style>
<div class="grid" id="grid"></div>
<div class="zoom" id="zoom" onclick="this.classList.remove('on')"><img id="zoomimg"></div>
<script>
let last = '';
async function refresh(){
  try{
    const r = await fetch('/list'); const items = await r.json();
    const key = JSON.stringify(items.map(i=>i.full+i.size));
    if(key===last) return; last = key;
    const grid = document.getElementById('grid'); grid.innerHTML='';
    for(const it of items){
      const f = document.createElement('figure');
      const img = document.createElement('img');
      img.src = '/img?p='+encodeURIComponent(it.full)+'&v='+it.mtime;
      img.onclick = ()=>{document.getElementById('zoomimg').src=img.src;document.getElementById('zoom').classList.add('on')};
      const cap = document.createElement('figcaption');
      cap.textContent = it.full.split('\\\\').pop();
      f.append(img,cap); grid.append(f);
    }
  }catch(e){/* server restarting */}
}
refresh(); setInterval(refresh, 2000);
</script>`;

const server = http.createServer((req, res) => {
  const url = new URL(req.url ?? '/', `http://127.0.0.1:${PORT}`);
  if (url.pathname === '/') {
    res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
    res.end(PAGE);
  } else if (url.pathname === '/list') {
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify(listNewest()));
  } else if (url.pathname === '/img') {
    const p = url.searchParams.get('p') ?? '';
    if (!isAllowed(p) || !fs.existsSync(p)) {
      res.writeHead(404).end('not found');
      return;
    }
    const type = p.toLowerCase().endsWith('.webp')
      ? 'image/webp'
      : /\.jpe?g$/i.test(p)
        ? 'image/jpeg'
        : 'image/png';
    res.writeHead(200, { 'content-type': type, 'cache-control': 'max-age=3600' });
    fs.createReadStream(p).pipe(res);
  } else {
    res.writeHead(404).end('not found');
  }
});

server.listen(PORT, '127.0.0.1', () => {
  console.log(`art-review gallery on http://127.0.0.1:${PORT}`);
});
