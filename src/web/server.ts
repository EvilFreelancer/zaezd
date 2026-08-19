/**
 * The HTTP surface of Zaezd.
 *
 * At this stage it carries only what deployment needs to be verifiable end to end: a health
 * probe for Traefik and a static file server for `src/web/public`. The trip board, `/t/:id`
 * and the progressive-load stream arrive with their own features; this file grows, it is not
 * replaced.
 */
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import { createReadStream, statSync } from 'node:fs';
import { extname, normalize, resolve, sep } from 'node:path';

const PUBLIC_DIR = resolve(import.meta.dirname, 'public');

const CONTENT_TYPES: Readonly<Record<string, string>> = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
};

/** Resolve a URL path inside PUBLIC_DIR, or `undefined` when it tries to escape it. */
export function resolvePublicPath(urlPath: string, root: string = PUBLIC_DIR): string | undefined {
  let decoded: string;
  try {
    decoded = decodeURIComponent(urlPath);
  } catch {
    return undefined;
  }
  if (decoded.includes('\0')) return undefined;

  const candidate = resolve(root, `.${normalize(decoded)}`);
  return candidate === root || candidate.startsWith(root + sep) ? candidate : undefined;
}

function serveStatic(res: ServerResponse, filePath: string): boolean {
  let size: number;
  try {
    const stats = statSync(filePath);
    if (!stats.isFile()) return false;
    size = stats.size;
  } catch {
    return false;
  }

  res.writeHead(200, {
    'Content-Type': CONTENT_TYPES[extname(filePath)] ?? 'application/octet-stream',
    'Content-Length': size,
  });
  createReadStream(filePath).pipe(res);
  return true;
}

function handle(req: IncomingMessage, res: ServerResponse): void {
  const url = new URL(req.url ?? '/', 'http://localhost');

  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.writeHead(405, { Allow: 'GET, HEAD' }).end('Method Not Allowed\n');
    return;
  }

  if (url.pathname === '/healthz') {
    res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify({ status: 'ok', mode: process.env['ZAEZD_MODE'] ?? 'live' }));
    return;
  }

  const filePath = resolvePublicPath(url.pathname === '/' ? '/index.html' : url.pathname);
  if (filePath !== undefined && serveStatic(res, filePath)) return;

  res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' }).end('Not Found\n');
}

export function startServer(port: number): Server {
  const server = createServer(handle);
  server.headersTimeout = 10_000;
  server.requestTimeout = 30_000;
  server.listen(port, () => console.warn(`zaezd listening on http://0.0.0.0:${port}`));

  for (const signal of ['SIGTERM', 'SIGINT'] as const) {
    process.on(signal, () => {
      server.close(() => process.exit(0));
    });
  }
  return server;
}
