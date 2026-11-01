// Lokaler Testserver ohne Cloudflare: liefert das Spiel aus und beantwortet
// /api/* mit demselben Worker-Code, die Datenbank ist eine SQLite-Datei.
// Aufruf (im Projektordner): node worker/dev.mjs   ->  http://localhost:8642
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { readFileSync } from 'node:fs';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import worker from './src/index.js';
import { createD1 } from './d1-sqlite.mjs';

const root = fileURLToPath(new URL('..', import.meta.url));
const port = Number(process.env.PORT || 8642);
const db = createD1(process.env.DB_FILE || join(root, 'worker', '.dev.sqlite'));
db.exec(readFileSync(join(root, 'worker', 'schema.sql'), 'utf8'));
const env = { DB: db, ALLOWED_ORIGINS: `http://localhost:${port}` };

const TYPES = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css',
  '.json': 'application/json', '.webmanifest': 'application/manifest+json', '.svg': 'image/svg+xml', '.png': 'image/png',
};

createServer(async (req, res) => {
  const url = new URL(req.url, `http://localhost:${port}`);
  if (url.pathname.startsWith('/api/')) {
    const chunks = [];
    for await (const c of req) chunks.push(c);
    const request = new Request(url, { method: req.method, headers: req.headers, body: chunks.length ? Buffer.concat(chunks) : undefined });
    const r = await worker.fetch(request, env);
    res.writeHead(r.status, Object.fromEntries(r.headers));
    res.end(Buffer.from(await r.arrayBuffer()));
    return;
  }
  const path = normalize(join(root, decodeURIComponent(url.pathname === '/' ? '/index.html' : url.pathname)));
  if (!path.startsWith(root) || path.includes(`${root}worker`)) { res.writeHead(403).end(); return; }
  try {
    const data = await readFile(path);
    res.writeHead(200, { 'content-type': TYPES[extname(path)] || 'application/octet-stream', 'cache-control': 'no-store' });
    res.end(data);
  } catch {
    res.writeHead(404).end('not found');
  }
}).listen(port, () => console.log(`Knobelfeld mit lokaler Weltrangliste: http://localhost:${port}`));
