/**
 * Transport, lodging and payment links.
 *
 * No session, unlike the catalogue: Tutu answers a bare POST. Exactly four of its sixteen tools
 * are used, and none of them is ever re-exported outward - the point of the gateway is a
 * product contract, not a proxy for somebody else's search.
 *
 * Two failures degrade differently on purpose. Without transport there is no package to
 * assemble and the reason is shown; without hotels the packages are assembled anyway and say so.
 * Checkout calls are never cached, because `checkout_ref` and `search_id` expire and a cached
 * one turns a cart button into a search page some hours later.
 *
 * Reference in `specs/03-istochniki.md` and `specs/07-nadezhnost.md`.
 */
import type { TtlCache} from './cache.ts';
import { TTL, cacheKey } from './cache.ts';
import {
  normalizeCheckout,
  normalizeHotels,
  normalizeTransport,
  unwrapToolResult,
  type CheckoutAnswer,
} from './normalize.ts';
import { httpTransport, type McpTransport } from './mcp-client.ts';
import type { HotelSearch, IsoDate, TransportSearch } from '../composer/types.ts';

export const TUTU_TIMEOUT_MS = 12_000;

const SOURCE = 'tutu';

export type TransportQuery = {
  readonly origin: string;
  readonly destination: string;
  readonly departureDate: IsoDate;
  readonly adults?: number;
  readonly pageSize?: number;
};

export type HotelQuery = {
  readonly city: string;
  readonly checkIn: IsoDate;
  readonly checkOut: IsoDate;
  readonly adults?: number;
  readonly pageSize?: number;
};

export type TutuClient = {
  searchTransport(query: TransportQuery): Promise<TransportSearch>;
  searchHotels(query: HotelQuery): Promise<HotelSearch>;
  /** The room rates of one hotel, which is the only place a cart hash comes from. */
  hotelDetails(query: HotelQuery & { readonly hotelId: string }): Promise<unknown>;
  createCheckoutLink(ref: Readonly<Record<string, unknown>>): Promise<CheckoutAnswer>;
};

export type TutuOptions = {
  readonly transport: McpTransport;
  readonly cache: TtlCache;
};

export function tutuClient(options: TutuOptions): TutuClient {
  const call = async (tool: string, args: Record<string, unknown>): Promise<unknown> =>
    unwrapToolResult(SOURCE, await options.transport.call(tool, args));

  return {
    async searchTransport(query) {
      const args = {
        origin: query.origin,
        destination: query.destination,
        departure_date: query.departureDate,
        // Multitransport prices every mode for adults only. A party with children needs the
        // per-mode searches, which the product does not do and says so in its limitations.
        adults: query.adults ?? 1,
        page_size: query.pageSize ?? 6,
      };
      const payload = await options.cache.through(
        cacheKey(SOURCE, 'search_multitransport', args),
        TTL.transport,
        () => call('search_multitransport', args),
      );
      return normalizeTransport(payload);
    },

    async searchHotels(query) {
      // city_name, never a geo_id taken from a transport answer: they are different namespaces,
      // and the documented symptom is an empty hotels[] next to perfectly live transport.
      const args = {
        city_name: query.city,
        check_in: query.checkIn,
        check_out: query.checkOut,
        adults: query.adults ?? 1,
        page_size: query.pageSize ?? 20,
      };
      const payload = await options.cache.through(
        cacheKey(SOURCE, 'search_hotels', args),
        TTL.hotels,
        () => call('search_hotels', args),
      );
      return normalizeHotels(payload);
    },

    async hotelDetails(query) {
      // Not cached: the room rate hashes it exists to fetch are exactly the things that expire.
      return call('get_offer_details', {
        product_type: 'hotels',
        offer_id: query.hotelId,
        check_in: query.checkIn,
        check_out: query.checkOut,
        adults: query.adults ?? 1,
      });
    },

    async createCheckoutLink(ref) {
      // Never cached either, and rebuilt at click time. A stored link is a cart button that
      // silently becomes a search page.
      return normalizeCheckout(await call('create_checkout_link', { ...ref }));
    },
  };
}

export function liveTutu(options: {
  readonly url: string;
  readonly userAgent: string;
  readonly cache: TtlCache;
}): TutuClient {
  return tutuClient({
    transport: httpTransport({
      url: options.url,
      source: SOURCE,
      timeoutMs: TUTU_TIMEOUT_MS,
      userAgent: options.userAgent,
    }),
    cache: options.cache,
  });
}
