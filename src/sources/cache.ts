/**
 * One in-memory cache with a TTL per source, and the key that makes it work.
 *
 * The key is built from the normalised arguments, not from the raw ones. Agents send the same
 * request in three different shapes, and without normalisation the same question is asked
 * upstream three times - which matters when a cold rail search takes 6.3 seconds.
 *
 * No clock of its own: the current time arrives as a function, so a test can move it without
 * sleeping and without the suite becoming slow and flaky at once.
 *
 * TTLs are specified in `specs/07-nadezhnost.md`.
 */
import { canonicalList } from './arguments.ts';

const SECOND = 1000;
const MINUTE = 60 * SECOND;

/** How long an answer stays good, by what it is an answer to. */
export const TTL = {
  /** The catalogue directories change over weeks, not over a session. */
  catalogueDirectory: Number.POSITIVE_INFINITY,
  catalogueEvents: 10 * MINUTE,
  /** Prices and availability do not live long. */
  transport: 5 * MINUTE,
  hotels: 5 * MINUTE,
  /** Nominatim asks for at most one request per second, so a venue is remembered for a day. */
  geocoding: 24 * 60 * MINUTE,
  productionCalendar: Number.POSITIVE_INFINITY,
  weather: 60 * MINUTE,
} as const;

/**
 * Never cached, and this is a rule rather than an oversight: `checkout_ref` and `search_id`
 * expire quickly, and a cached one turns a cart button into a search page some hours later.
 */
export const NEVER_CACHED: readonly string[] = ['create_checkout_link', 'get_offer_details'];

export type Clock = () => number;

export type CacheOptions = {
  readonly clock: Clock;
  /** A ceiling, so a stream of different requests cannot exhaust the process. */
  readonly maxEntries?: number;
};

const DEFAULT_MAX_ENTRIES = 500;

type Entry = {
  readonly value: unknown;
  readonly expiresAt: number;
};

/**
 * A cache key that treats a request as a request rather than as a string.
 *
 * Object keys are sorted, list arguments are canonicalised into sorted unique sets, and
 * everything else is stringified as it stands. `["ai","data"]`, `"[\"data\",\"ai\"]"` and
 * `"data, ai"` are the same question and must not be asked upstream three times.
 */
export function cacheKey(
  source: string,
  tool: string,
  args: Readonly<Record<string, unknown>>,
): string {
  const shaped = Object.keys(args)
    .sort()
    .map((name) => {
      const value = args[name];
      if (Array.isArray(value) || (typeof value === 'string' && value.includes(','))) {
        return [name, canonicalList(value)] as const;
      }
      if (typeof value === 'string' && value.trim().startsWith('[')) {
        return [name, canonicalList(value)] as const;
      }
      return [name, value ?? null] as const;
    });

  return `${source}:${tool}:${JSON.stringify(shaped)}`;
}

export class TtlCache {
  readonly #entries = new Map<string, Entry>();
  readonly #inFlight = new Map<string, Promise<unknown>>();
  readonly #clock: Clock;
  readonly #maxEntries: number;

  constructor(options: CacheOptions) {
    this.#clock = options.clock;
    this.#maxEntries = options.maxEntries ?? DEFAULT_MAX_ENTRIES;
  }

  get size(): number {
    return this.#entries.size;
  }

  get<T>(key: string): T | undefined {
    const entry = this.#entries.get(key);
    if (entry === undefined) return undefined;

    if (entry.expiresAt <= this.#clock()) {
      this.#entries.delete(key);
      return undefined;
    }
    return entry.value as T;
  }

  set(key: string, value: unknown, ttlMs: number): void {
    if (ttlMs <= 0) return;

    // Insertion order is eviction order, and re-setting a key moves it to the end.
    this.#entries.delete(key);
    this.#entries.set(key, { value, expiresAt: this.#clock() + ttlMs });

    while (this.#entries.size > this.#maxEntries) {
      const oldest = this.#entries.keys().next().value;
      if (oldest === undefined) break;
      this.#entries.delete(oldest);
    }
  }

  /**
   * The cached answer, or one produced now.
   *
   * Two identical requests in flight at once share a single call upstream, which is what stops
   * a page with three cards from asking Tutu the same question three times. A rejected promise
   * is never stored: caching a failure would keep failing for as long as the TTL says.
   */
  async through<T>(key: string, ttlMs: number, produce: () => Promise<T>): Promise<T> {
    const cached = this.get<T>(key);
    if (cached !== undefined) return cached;

    const running = this.#inFlight.get(key);
    if (running !== undefined) return running as Promise<T>;

    const started = produce()
      .then((value) => {
        this.set(key, value, ttlMs);
        return value;
      })
      .finally(() => {
        this.#inFlight.delete(key);
      });

    this.#inFlight.set(key, started);
    return started;
  }

  clear(): void {
    this.#entries.clear();
  }
}
