/**
 * How the optional sources are reached, and the rule they all obey.
 *
 * Every enrichment is a function with a timeout and a fallback, never a service. A geocoder
 * that is slow today must not turn into a trip that does not load, so a failure here resolves
 * to absence and the screen renders the absence. Nothing is ever invented to fill the gap.
 *
 * Timeouts are in `specs/07-nadezhnost.md`.
 */
import { SourceError } from '../sources/normalize.ts';
import type { Recordings } from '../sources/replay.ts';

export const ENRICH_TIMEOUT_MS = 4_000;

export type HttpAnswer = {
  readonly status: number;
  readonly body: unknown;
};

export type HttpFetch = (
  url: string,
  args: Readonly<Record<string, unknown>>,
) => Promise<HttpAnswer>;

export type LiveHttpOptions = {
  readonly userAgent: string;
  readonly timeoutMs?: number;
};

/**
 * A plain GET.
 *
 * The body is parsed as JSON only when the server says it is JSON. isDayOff answers with a bare
 * string of digits, and `JSON.parse` turns "1100000110000011" into 1.1e15 without an error of
 * any kind, quietly destroying the production calendar.
 */
export function liveHttp(options: LiveHttpOptions): HttpFetch {
  return async (url) => {
    const response = await fetch(url, {
      headers: { 'User-Agent': options.userAgent, Accept: 'application/json, text/plain' },
      signal: AbortSignal.timeout(options.timeoutMs ?? ENRICH_TIMEOUT_MS),
    });

    const text = await response.text();
    const isJson = (response.headers.get('content-type') ?? '').includes('json');
    let body: unknown = text;
    if (isJson) {
      try {
        body = JSON.parse(text);
      } catch {
        body = text;
      }
    }
    return { status: response.status, body };
  };
}

/**
 * The same interface, answered from `fixtures/`.
 *
 * `tool` names which recording to look in and is not part of the request itself, so it is
 * stripped before the key is built. Left in, no recorded lookup would ever match, and replay
 * would refuse every enrichment while looking exactly like a source outage.
 */
export function replayHttp(source: string, recordings: Recordings): HttpFetch {
  return async (url, args) => {
    const { tool, ...rest } = args;
    if (typeof tool !== 'string') {
      throw new SourceError('replay', 'an enrichment lookup arrived without a tool name', args);
    }
    return recordings.http(source, tool, { url, ...rest });
  };
}

/**
 * Runs an optional source and swallows whatever it does wrong.
 *
 * This is where the failure policy actually lives: an enrichment that throws, times out or
 * answers nonsense becomes `undefined`, and the caller renders the absence. It never becomes a
 * default, an average or a guess.
 */
export async function optional<T>(work: () => Promise<T | undefined>): Promise<T | undefined> {
  try {
    return await work();
  } catch {
    return undefined;
  }
}
