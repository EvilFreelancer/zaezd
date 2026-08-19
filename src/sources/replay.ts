/**
 * The recorded sources, read back.
 *
 * `ZAEZD_MODE=replay` opens no sockets at all. That gives three things at once: development
 * that does not wait seconds on every call, a demo that survives the venue network, and a test
 * suite that runs on the same bytes the live sources actually returned.
 *
 * The reference date comes from the recording, not from the wall clock. Without that, a
 * recorded August event silently becomes a past event a week later, event selection drops it,
 * and the suite goes red blaming the composer for the calendar.
 *
 * Reference in `specs/07-nadezhnost.md`.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { cacheKey } from './cache.ts';
import { SourceError } from './normalize.ts';
import type { IsoDate } from '../composer/types.ts';

export type RecordedCall = {
  readonly file: string;
  readonly recorded_at: string;
  readonly source: string;
  readonly tool: string;
  readonly arguments: Readonly<Record<string, unknown>>;
  readonly note?: string;
  /** Fields that expire. Good for parsing, never checked for liveness. */
  readonly volatile?: readonly string[];
};

export type Manifest = {
  readonly recorded_at: string;
  readonly entries: readonly RecordedCall[];
};

export type Recordings = {
  /** The moment the fixtures were captured, used as "today" in replay. */
  readonly recordedAt: string;
  readonly referenceDate: IsoDate;
  /** The whole MCP envelope, as it came off the wire. */
  envelope(source: string, tool: string, args: Readonly<Record<string, unknown>>): unknown;
  /** A plain HTTP answer, status and all. The status is part of the answer, not decoration. */
  http(
    source: string,
    tool: string,
    args: Readonly<Record<string, unknown>>,
  ): { readonly status: number; readonly body: unknown };
  /** True when the recorded answer carries fields that have most likely expired by now. */
  isVolatile(source: string, tool: string, args: Readonly<Record<string, unknown>>): boolean;
};

type Stored = {
  readonly call: RecordedCall;
  readonly response: { readonly envelope?: unknown; readonly body?: unknown; readonly status?: number };
};

export function loadRecordings(root = 'fixtures'): Recordings {
  const manifestPath = resolve(root, 'manifest.json');
  let manifest: Manifest;
  try {
    manifest = JSON.parse(readFileSync(manifestPath, 'utf8')) as Manifest;
  } catch (cause) {
    throw new SourceError(
      'replay',
      `could not read ${manifestPath}; run npm run record to create it`,
      cause,
    );
  }

  const byKey = new Map<string, Stored>();
  for (const call of manifest.entries) {
    const stored = JSON.parse(readFileSync(resolve(root, call.file), 'utf8')) as {
      response: Stored['response'];
    };
    byKey.set(cacheKey(call.source, call.tool, call.arguments), { call, response: stored.response });
  }

  const find = (
    source: string,
    tool: string,
    args: Readonly<Record<string, unknown>>,
  ): Stored | undefined => byKey.get(cacheKey(source, tool, args));

  return {
    recordedAt: manifest.recorded_at,
    referenceDate: manifest.recorded_at.slice(0, 10),

    envelope(source, tool, args) {
      const stored = find(source, tool, args);
      if (stored === undefined) {
        // A missing recording is a missing recording. Falling through to the network here
        // would make replay mode quietly stop being replay mode.
        throw new SourceError(
          'replay',
          `has no recording of ${source}.${tool} with these arguments; run npm run record`,
          args,
        );
      }
      return stored.response.envelope ?? stored.response.body ?? stored.response;
    },

    http(source, tool, args) {
      const stored = find(source, tool, args);
      if (stored === undefined) {
        throw new SourceError(
          'replay',
          `has no recording of ${source}.${tool} with these arguments; run npm run record`,
          args,
        );
      }
      return { status: stored.response.status ?? 200, body: stored.response.body };
    },

    isVolatile(source, tool, args) {
      return (find(source, tool, args)?.call.volatile?.length ?? 0) > 0;
    },
  };
}
