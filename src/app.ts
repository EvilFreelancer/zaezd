/**
 * The wiring: one place where the mode is decided and everything is plugged together.
 *
 * `live` calls the sources and caches; `replay` reads `fixtures/` and opens no socket. There is
 * no third mode, and recording is a script rather than a server state, because a server that
 * can quietly write fixtures is a server that will do it on stage.
 *
 * Reference in `specs/07-nadezhnost.md`.
 */
import { buildTrip, limitConcurrency, type Stage, type TripResult } from './composer/build-trip.ts';
import { buildCheckout } from './composer/build-checkout.ts';
import type { TripVariant } from './composer/packages.ts';
import type { CheckoutLink, TripRequest } from './composer/types.ts';
import { TtlCache } from './sources/cache.ts';
import { confcalClient, liveConfcal, type ConfcalClient } from './sources/confcal.ts';
import { liveTutu, tutuClient, type TutuClient } from './sources/tutu.ts';
import { replayTransport } from './sources/mcp-client.ts';
import { loadRecordings, type Recordings } from './sources/replay.ts';
import { liveHttp, replayHttp, type HttpFetch } from './enrich/http.ts';

/** Three trip assemblies at once per process; each one fans out to six sources. */
const MAX_CONCURRENT_TRIPS = 3;

export type Mode = 'live' | 'replay';

export type App = {
  readonly mode: Mode;
  /** In replay this is the day the fixtures were recorded, so nothing rots overnight. */
  readonly referenceDate: string;
  assemble(
    request: TripRequest,
    onStage?: (stage: Stage) => void,
    /** The event a shared link named, so `/t/:id` opens the trip it was made from. */
    pinnedEventId?: number,
  ): Promise<TripResult>;
  checkout(trip: TripResult, variant: TripVariant): Promise<readonly CheckoutLink[]>;
};

export type AppOptions = {
  readonly mode?: Mode;
  readonly confcalUrl?: string;
  readonly tutuUrl?: string;
  readonly contactEmail?: string;
  /** Injected in tests; production reads the clock. */
  readonly now?: () => Date;
};

function userAgentFor(contact: string): string {
  // Nominatim bans anonymous traffic and asks to be able to reach a human.
  return `zaezd/0.1 (+https://zaezd.rpa.icu; ${contact})`;
}

/** One source of enrichment answers, dispatched by host, so replay needs no extra plumbing. */
function replayEnrichment(recordings: Recordings): HttpFetch {
  return async (url, args) => {
    const source = url.includes('nominatim')
      ? 'nominatim'
      : url.includes('routed-foot') || url.includes('project-osrm')
        ? 'osrm'
        : url.includes('isdayoff')
          ? 'isdayoff'
          : 'open-meteo';
    return replayHttp(source, recordings)(url, args);
  };
}

export function createApp(options: AppOptions = {}): App {
  const mode: Mode = options.mode ?? (process.env['ZAEZD_MODE'] === 'replay' ? 'replay' : 'live');
  const now = options.now ?? ((): Date => new Date());
  const cache = new TtlCache({ clock: () => (options.now?.() ?? new Date()).getTime() });
  const contact = options.contactEmail ?? process.env['ZAEZD_CONTACT_EMAIL'] ?? 'hello@zaezd.rpa.icu';
  const userAgent = userAgentFor(contact);

  let confcal: ConfcalClient;
  let tutu: TutuClient;
  let http: HttpFetch;
  let referenceDate: string;
  let recordings: Recordings | undefined;

  if (mode === 'replay') {
    recordings = loadRecordings();
    confcal = confcalClient({ transport: replayTransport('confcal', recordings), cache });
    tutu = tutuClient({ transport: replayTransport('tutu', recordings), cache });
    http = replayEnrichment(recordings);
    referenceDate = recordings.referenceDate;
  } else {
    const confcalUrl = options.confcalUrl ?? process.env['ZAEZD_CONFCAL_URL'] ?? 'https://confcal.rpa.icu/mcp';
    const tutuUrl = options.tutuUrl ?? process.env['ZAEZD_TUTU_URL'] ?? 'https://mcp.tutu.ru/mcp';
    confcal = liveConfcal({ url: confcalUrl, userAgent, cache });
    tutu = liveTutu({ url: tutuUrl, userAgent, cache });
    http = liveHttp({ userAgent });
    referenceDate = now().toISOString().slice(0, 10);
  }

  const enrich = { http, cache };
  const queue = limitConcurrency(MAX_CONCURRENT_TRIPS);

  return {
    mode,
    referenceDate,

    async assemble(request, onStage, pinnedEventId) {
      return queue(async () =>
        buildTrip(request, {
          confcal,
          tutu,
          geo: enrich,
          calendar: enrich,
          weather: enrich,
          asOf: mode === 'replay' ? referenceDate : now().toISOString().slice(0, 10),
          computedAt: mode === 'replay' ? (recordings?.recordedAt ?? '') : now().toISOString(),
          mode,
          ...(onStage === undefined ? {} : { onStage }),
          ...(pinnedEventId === undefined ? {} : { pinnedEventId }),
        }),
      );
    },

    async checkout(trip, variant) {
      return buildCheckout(variant, {
        tutu,
        checkIn: trip.stay?.checkIn ?? '',
        checkOut: trip.stay?.checkOut ?? '',
        adults: trip.request.adults,
        ...(mode === 'replay' ? { recorded: true } : {}),
      });
    },
  };
}
