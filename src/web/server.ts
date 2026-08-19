/**
 * The HTTP surface of Zaezd.
 *
 * Four routes and nothing clever. `GET /` opens on a computed trip rather than on a form,
 * because the first thirty seconds decide whether anyone reads the second screen. `GET /t/:id`
 * reopens a shared trip from the identifier alone - there is no trip state on this server.
 * `GET /api/trip` streams the stages so cards appear as they become ready, and
 * `POST /api/checkout` builds the payment links at click time because they expire.
 *
 * Written on `node:http`, so the things a framework would have done are done here on purpose:
 * a body ceiling, a method check, socket timeouts and a graceful shutdown.
 */
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import { createReadStream, statSync } from 'node:fs';
import { extname, normalize, resolve, sep } from 'node:path';
import { createApp, type App } from '../app.ts';
import { decodeTripId, encodeTripId, TripIdError } from '../composer/trip-id.ts';
import { toList, toNumber, toText } from '../sources/arguments.ts';
import type { TripRequest } from '../composer/types.ts';
import type { TripResult } from '../composer/build-trip.ts';
import { renderShell } from './render.ts';
import { createMcpServer } from '../mcp/server.ts';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';

const PUBLIC_DIR = resolve(import.meta.dirname, 'public');

/** A request body arrives from strangers; nobody gets to make this parse a megabyte. */
const MAX_BODY_BYTES = 16_384;

const ASSETS = {
  styles: '/styles.css',
  script: '/boot.js',
  leaflet: '/vendor/leaflet/leaflet.css',
} as const;

/** What the public link opens on when nobody asked for anything in particular. */
const DEFAULT_REQUEST: TripRequest = {
  topics: ['ai'],
  origin: 'Москва',
  adults: 1,
};

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
    'Cache-Control': 'public, max-age=300',
  });
  createReadStream(filePath).pipe(res);
  return true;
}

function html(res: ServerResponse, status: number, body: string): void {
  res.writeHead(status, { 'Content-Type': 'text/html; charset=utf-8' });
  res.end(body);
}

function json(res: ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(body));
}

/** A request read out of query parameters, forgiving about the shapes they arrive in. */
export function requestFromQuery(params: URLSearchParams): TripRequest {
  const topics = toList(params.get('topics') ?? undefined);
  return {
    topics: topics.length > 0 ? topics : DEFAULT_REQUEST.topics,
    origin: toText(params.get('origin')) ?? DEFAULT_REQUEST.origin,
    adults: toNumber(params.get('adults')) ?? DEFAULT_REQUEST.adults,
    ...(toNumber(params.get('budget')) === undefined ? {} : { budget: toNumber(params.get('budget')) as number }),
    ...(toText(params.get('date_from')) === undefined ? {} : { dateFrom: toText(params.get('date_from')) as string }),
    ...(toText(params.get('date_to')) === undefined ? {} : { dateTo: toText(params.get('date_to')) as string }),
  };
}

async function readBody(req: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  let size = 0;

  for await (const chunk of req) {
    size += (chunk as Buffer).length;
    if (size > MAX_BODY_BYTES) throw new RangeError('The request body is too large');
    chunks.push(chunk as Buffer);
  }
  if (chunks.length === 0) return {};

  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8'));
  } catch {
    throw new RangeError('The request body is not JSON');
  }
}

async function board(app: App, res: ServerResponse, request: TripRequest): Promise<void> {
  let trip: TripResult;
  try {
    trip = await app.assemble(request);
  } catch (error) {
    html(
      res,
      502,
      renderShell({
        channel: 'web',
        title: 'Заезд',
        problem: `Источник не ответил: ${error instanceof Error ? error.message : 'неизвестно'}`,
        assets: ASSETS,
      }),
    );
    return;
  }

  const title = trip.event === undefined ? 'Заезд' : `${trip.event.event.title} — Заезд`;
  html(res, 200, renderShell({ channel: 'web', title, trip, assets: ASSETS }));
}

/**
 * The stages, as they complete.
 *
 * Not a spinner: the traveller is told the events are found while the transport is still being
 * priced, which is the difference between a screen that feels alive and one that feels stuck.
 */
async function stream(app: App, res: ServerResponse, request: TripRequest): Promise<void> {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream; charset=utf-8',
    'Cache-Control': 'no-cache',
    Connection: 'keep-alive',
  });

  const send = (event: string, data: unknown): void => {
    res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
  };

  try {
    const trip = await app.assemble(request, (stage) => send('stage', { stage }));
    send('trip', trip);
  } catch (error) {
    send('failed', { message: error instanceof Error ? error.message : 'источник не ответил' });
  }
  res.end();
}

async function checkout(app: App, res: ServerResponse, body: unknown): Promise<void> {
  const shaped = body as { request?: TripRequest; variantId?: string };
  if (shaped.request === undefined || shaped.variantId === undefined) {
    json(res, 400, { message: 'Нужны параметры поездки и выбранный вариант' });
    return;
  }

  const trip = await app.assemble(shaped.request);
  const chosen = trip.packages.find((item) => item.variant.id === shaped.variantId);
  if (chosen === undefined) {
    // The trip was recomputed and this variant is no longer among the offers. Saying so beats
    // handing over a link that belongs to a different journey.
    json(res, 409, { message: 'Этот вариант больше не предлагается, пересоберите поездку' });
    return;
  }

  json(res, 200, await app.checkout(trip, chosen.variant));
}

/**
 * One MCP server and one transport per request, no session store.
 *
 * `trip_id` encodes the request, so nothing about a conversation needs remembering between
 * calls, and a restart costs an agent nothing. The transport closes with the response it
 * served, which is why it cannot be built once and reused: a stateless transport is done
 * after one exchange.
 */
async function handleMcp(
  app: App,
  publicUrl: string,
  req: IncomingMessage,
  res: ServerResponse,
): Promise<void> {
  // Stateless means there is nothing for a stream to deliver later and no session to delete:
  // every answer belongs to the request that asked for it. Saying so beats holding a socket
  // open forever on a GET and reporting a successful close of a session that never existed.
  if (req.method !== 'POST') {
    res.writeHead(405, { Allow: 'POST', 'Content-Type': 'application/json; charset=utf-8' });
    res.end(
      JSON.stringify({
        jsonrpc: '2.0',
        error: { code: -32000, message: 'Этот MCP-сервер без сессий, используйте POST' },
        id: null,
      }),
    );
    return;
  }

  // The transport would read the stream itself, without a ceiling. It arrives from strangers.
  let body: unknown;
  try {
    body = await readBody(req);
  } catch (error) {
    res.writeHead(error instanceof RangeError ? 413 : 400, {
      'Content-Type': 'application/json; charset=utf-8',
    });
    res.end(
      JSON.stringify({
        jsonrpc: '2.0',
        error: { code: -32700, message: 'Запрос слишком большой или это не JSON' },
        id: null,
      }),
    );
    return;
  }

  const mcp = createMcpServer(app, publicUrl);
  // No options at all is the SDK's stateless mode: no session id is minted, because there is
  // no per-conversation state to key it to.
  const transport = new StreamableHTTPServerTransport();

  res.on('close', () => {
    void transport.close();
    void mcp.close();
  });

  await mcp.connect(transport as unknown as Parameters<typeof mcp.connect>[0]);
  await transport.handleRequest(req, res, body);
}

export function createHandler(app: App, publicUrl = process.env['ZAEZD_PUBLIC_URL'] ?? 'http://localhost:8080') {
  return async function handle(req: IncomingMessage, res: ServerResponse): Promise<void> {
    const url = new URL(req.url ?? '/', 'http://localhost');

    if (url.pathname === '/mcp') {
      await handleMcp(app, publicUrl, req, res);
      return;
    }

    if (url.pathname === '/healthz') {
      json(res, 200, { status: 'ok', mode: app.mode, referenceDate: app.referenceDate });
      return;
    }

    if (req.method === 'POST' && url.pathname === '/api/checkout') {
      try {
        await checkout(app, res, await readBody(req));
      } catch (error) {
        json(res, error instanceof RangeError ? 413 : 502, {
          message: error instanceof Error ? error.message : 'не получилось',
        });
      }
      return;
    }

    if (req.method !== 'GET' && req.method !== 'HEAD') {
      res.writeHead(405, { Allow: 'GET, HEAD, POST' }).end('Method Not Allowed\n');
      return;
    }

    if (url.pathname === '/') {
      await board(app, res, requestFromQuery(url.searchParams));
      return;
    }

    if (url.pathname === '/api/trip') {
      await stream(app, res, requestFromQuery(url.searchParams));
      return;
    }

    if (url.pathname.startsWith('/t/')) {
      try {
        const { request } = decodeTripId(url.pathname.slice('/t/'.length));
        await board(app, res, request);
      } catch (error) {
        const message =
          error instanceof TripIdError ? error.message : 'Эту ссылку не удалось прочитать';
        html(res, 400, renderShell({ channel: 'web', title: 'Заезд', problem: message, assets: ASSETS }));
      }
      return;
    }

    const filePath = resolvePublicPath(url.pathname);
    if (filePath !== undefined && serveStatic(res, filePath)) return;

    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' }).end('Not Found\n');
  };
}

/** The shareable link for a request, so the screen and the MCP tools hand back the same URL. */
export function publicLinkFor(request: TripRequest, baseUrl: string): string {
  return `${baseUrl.replace(/\/$/, '')}/t/${encodeTripId({ request })}`;
}

export function startServer(port: number, app: App = createApp()): Server {
  const handler = createHandler(app);
  const server = createServer((req, res) => {
    void handler(req, res).catch((error: unknown) => {
      // A handler that throws is an operational event, not a user error: say what broke.
      console.error(`${req.method} ${req.url} failed:`, error);
      if (!res.headersSent) res.writeHead(500, { 'Content-Type': 'text/plain' });
      res.end('Internal Server Error\n');
    });
  });

  server.headersTimeout = 10_000;
  server.requestTimeout = 60_000;
  server.listen(port, () => console.warn(`zaezd listening on http://0.0.0.0:${port} (${app.mode})`));

  for (const signal of ['SIGTERM', 'SIGINT'] as const) {
    process.on(signal, () => {
      server.close(() => process.exit(0));
    });
  }
  return server;
}
