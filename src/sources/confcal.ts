/**
 * The event catalogue.
 *
 * Three things make this client different from the Tutu one, and all three are measured rather
 * than assumed. confcal mints a session in the `mcp-session-id` response header and demands it
 * back afterwards; the session dies with the server process, so a lost one has to be reopened
 * once and the call retried rather than surfaced. And parallel calls through a single session
 * are not proven safe, so concurrency stays at one until somebody proves otherwise.
 *
 * Without events there is no product, so a catalogue outage is an error screen rather than a
 * degraded one. Reference in `specs/03-istochniki.md` and `specs/07-nadezhnost.md`.
 */
import type { TtlCache} from './cache.ts';
import { TTL, cacheKey } from './cache.ts';
import { normalizeCityDirectory, normalizeEvents, SourceError, unwrapToolResult } from './normalize.ts';
import { httpTransport, initializeSession, type McpTransport } from './mcp-client.ts';
import type { CatalogueEvent, CityDirectory, IsoDate } from '../composer/types.ts';

export const CONFCAL_TIMEOUT_MS = 8_000;

const SOURCE = 'confcal';

/** What a lost session looks like coming back. The wording is the server's, not ours. */
const SESSION_LOST = /session|сесси/i;

export type EventQuery = {
  readonly cities?: readonly string[];
  readonly topics?: readonly string[];
  readonly dateFrom?: IsoDate;
  readonly dateTo?: IsoDate;
  readonly format?: 'offline' | 'online' | 'hybrid';
  readonly limit?: number;
};

export type ConfcalClient = {
  searchEvents(query: EventQuery): Promise<readonly CatalogueEvent[]>;
  listCities(): Promise<CityDirectory>;
};

export type ConfcalOptions = {
  readonly transport: McpTransport;
  readonly cache: TtlCache;
  /** Reopens the session and returns whether a fresh one was obtained. Absent in replay. */
  readonly reopenSession?: () => Promise<void>;
};

function toArguments(query: EventQuery): Record<string, unknown> {
  return {
    ...(query.cities === undefined ? {} : { cities: [...query.cities] }),
    ...(query.topics === undefined ? {} : { topics: [...query.topics] }),
    ...(query.dateFrom === undefined ? {} : { date_from: query.dateFrom }),
    ...(query.dateTo === undefined ? {} : { date_to: query.dateTo }),
    ...(query.format === undefined ? {} : { event_format: query.format }),
    ...(query.limit === undefined ? {} : { limit: query.limit }),
  };
}

export function confcalClient(options: ConfcalOptions): ConfcalClient {
  // One call at a time. Parallel calls through one session are not proven safe, and a shared
  // session is exactly the kind of thing that fails only under load.
  let queue: Promise<unknown> = Promise.resolve();

  const serialise = async <T>(work: () => Promise<T>): Promise<T> => {
    const mine = queue.then(work, work);
    queue = mine.then(
      () => undefined,
      () => undefined,
    );
    return mine;
  };

  const callOnce = async (tool: string, args: Record<string, unknown>): Promise<unknown> =>
    unwrapToolResult(SOURCE, await options.transport.call(tool, args));

  const call = async (tool: string, args: Record<string, unknown>): Promise<unknown> =>
    serialise(async () => {
      try {
        return await callOnce(tool, args);
      } catch (error) {
        const lostSession =
          options.reopenSession !== undefined &&
          error instanceof SourceError &&
          SESSION_LOST.test(error.message);
        if (!lostSession) throw error;

        // Exactly once. A second reopen would loop against a server that is simply down.
        await options.reopenSession();
        return callOnce(tool, args);
      }
    });

  return {
    async searchEvents(query) {
      const args = toArguments(query);
      const payload = await options.cache.through(
        cacheKey(SOURCE, 'search_events', args),
        TTL.catalogueEvents,
        () => call('search_events', args),
      );
      return normalizeEvents(payload);
    },

    async listCities() {
      const args = { limit: 100, offset: 0 };
      const payload = await options.cache.through(
        cacheKey(SOURCE, 'list_cities', args),
        TTL.catalogueDirectory,
        () => call('list_cities', args),
      );
      return normalizeCityDirectory(payload);
    },
  };
}

/** A live client, with the session it owns and nobody else touches. */
export function liveConfcal(options: {
  readonly url: string;
  readonly userAgent: string;
  readonly cache: TtlCache;
}): ConfcalClient {
  let sessionId: string | undefined;

  const transport = httpTransport({
    url: options.url,
    source: SOURCE,
    timeoutMs: CONFCAL_TIMEOUT_MS,
    userAgent: options.userAgent,
    session: {
      header: () => sessionId,
      remember: (id) => {
        sessionId = id;
      },
    },
  });

  return confcalClient({
    transport,
    cache: options.cache,
    reopenSession: async () => {
      sessionId = await initializeSession({
        url: options.url,
        source: SOURCE,
        timeoutMs: CONFCAL_TIMEOUT_MS,
        userAgent: options.userAgent,
        clientName: 'zaezd',
      });
    },
  });
}
