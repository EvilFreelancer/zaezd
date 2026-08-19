/**
 * The transport both MCP servers are reached through, and the offline stand-in for it.
 *
 * Streamable HTTP is a POST with a JSON-RPC body and an answer that arrives either as JSON or
 * as a one-frame SSE stream. That is little enough to own outright, and owning it is what lets
 * `replay` present the same interface with no socket behind it.
 *
 * Two behaviours are not incidental. confcal mints a session in the `mcp-session-id` response
 * header and demands it back on every later call; Tutu has no session at all, and mixing the
 * two clients' headers is a documented way to break both. So the session lives in the client
 * that has one, and never in the shared transport.
 */
import { SourceError } from './normalize.ts';
import type { Recordings } from './replay.ts';

export type McpTransport = {
  /** The raw JSON-RPC envelope, exactly as the server sent it. Parsing is normalize.ts's job. */
  call(
    tool: string,
    args: Readonly<Record<string, unknown>>,
    options?: { readonly signal?: AbortSignal },
  ): Promise<unknown>;
};

export type HttpTransportOptions = {
  readonly url: string;
  readonly source: string;
  readonly timeoutMs: number;
  readonly userAgent: string;
  /** Called with the session header when the server mints one. */
  readonly session?: {
    header(): string | undefined;
    remember(id: string): void;
  };
};

/** An SSE answer carries one JSON frame across one or more `data:` lines. */
function readFrames(text: string): unknown {
  const frame = text
    .split('\n')
    .filter((line) => line.startsWith('data: '))
    .map((line) => line.slice('data: '.length))
    .join('');
  return JSON.parse(frame);
}

export function httpTransport(options: HttpTransportOptions): McpTransport {
  let nextId = 1;

  return {
    async call(tool, args, callOptions) {
      const timeout = AbortSignal.timeout(options.timeoutMs);
      const signal =
        callOptions?.signal === undefined
          ? timeout
          : AbortSignal.any([timeout, callOptions.signal]);

      const sessionId = options.session?.header();
      let response: Response;
      try {
        response = await fetch(options.url, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Accept: 'application/json, text/event-stream',
            'User-Agent': options.userAgent,
            ...(sessionId === undefined ? {} : { 'mcp-session-id': sessionId }),
          },
          body: JSON.stringify({
            jsonrpc: '2.0',
            id: nextId++,
            method: 'tools/call',
            params: { name: tool, arguments: args },
          }),
          signal,
        });
      } catch (cause) {
        const timedOut = timeout.aborted;
        throw new SourceError(
          options.source,
          timedOut ? `did not answer within ${options.timeoutMs} ms` : 'could not be reached',
          cause,
          timedOut ? 'timeout' : 'unreachable',
        );
      }

      const minted = response.headers.get('mcp-session-id');
      if (minted !== null) options.session?.remember(minted);

      const text = await response.text();
      if (!response.ok) {
        throw new SourceError(options.source, `answered with HTTP ${response.status}`, text, 'refused');
      }

      try {
        return (response.headers.get('content-type') ?? '').includes('text/event-stream')
          ? readFrames(text)
          : JSON.parse(text);
      } catch (cause) {
        throw new SourceError(options.source, 'answered with something that is not JSON', cause);
      }
    },
  };
}

/** Opens a session and returns the identifier the server minted, if it minted one. */
export async function initializeSession(options: {
  readonly url: string;
  readonly source: string;
  readonly timeoutMs: number;
  readonly userAgent: string;
  readonly clientName: string;
}): Promise<string | undefined> {
  let response: Response;
  try {
    response = await fetch(options.url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json, text/event-stream',
        'User-Agent': options.userAgent,
      },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 0,
        method: 'initialize',
        params: {
          protocolVersion: '2025-06-18',
          capabilities: {},
          clientInfo: { name: options.clientName, version: '0.1.0' },
        },
      }),
      signal: AbortSignal.timeout(options.timeoutMs),
    });
  } catch (cause) {
    throw new SourceError(options.source, 'could not be reached to open a session', cause, 'unreachable');
  }

  await response.text();
  if (!response.ok) {
    throw new SourceError(
      options.source,
      `refused a session with HTTP ${response.status}`,
      undefined,
      'refused',
    );
  }
  return response.headers.get('mcp-session-id') ?? undefined;
}

/** The same interface, answered from `fixtures/`. No socket is opened, ever. */
export function replayTransport(source: string, recordings: Recordings): McpTransport {
  return {
    async call(tool, args) {
      return recordings.envelope(source, tool, args);
    },
  };
}
