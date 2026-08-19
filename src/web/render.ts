/**
 * The HTML shell both channels share.
 *
 * The shell and the renderer are the same in the browser and inside an MCP App; only the data
 * path differs. The web page gets the `TripResult` embedded here, the App receives it from the
 * host after loading, because an App resource is fetched independently of the tool call and
 * cannot carry a result at all.
 *
 * Every string that came from a source is escaped on the way out: event and hotel names are
 * third-party input, and this is the last place before a browser reads them.
 */
import type { TripResult } from '../composer/build-trip.ts';

export type Channel = 'web' | 'app';

export type ShellOptions = {
  readonly channel: Channel;
  readonly title: string;
  /** Embedded for the web channel; the App waits for the host instead. */
  readonly trip?: TripResult;
  /** A one-line explanation shown when there is no trip to show at all. */
  readonly problem?: string;
  readonly assets: {
    /** The vendored Kite token extract. Every colour on the screen reads from it. */
    readonly tokens: string;
    readonly styles: string;
    readonly script: string;
    readonly leaflet: string;
  };
};

const ENTITIES: Readonly<Record<string, string>> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
};

/** Text and attributes. Both, because an unescaped quote in an attribute is the same hole. */
export function escapeHtml(value: string): string {
  return value.replaceAll(/[&<>"']/g, (char) => ENTITIES[char] as string);
}

/**
 * JSON safe to sit inside a `<script>` element.
 *
 * `</script>` inside a string closes the element no matter where it appears, and a hotel called
 * `</script><img onerror=...>` is a name a source could return tomorrow.
 */
export function escapeJson(value: unknown): string {
  return JSON.stringify(value)
    .replaceAll('<', '\\u003c')
    .replaceAll('>', '\\u003e')
    .replaceAll(' ', '\\u2028')
    .replaceAll(' ', '\\u2029');
}

/** What a traveller with no JavaScript, or a failed script, still gets to read. */
function fallbackText(
  trip: TripResult | undefined,
  problem: string | undefined,
  channel: Channel,
): string {
  if (problem !== undefined) return escapeHtml(problem);
  // The App shell ships without a trip on purpose: it is waiting for one, not reporting a
  // failure to find one, and saying otherwise would be the first thing a host renders.
  if (channel === 'app') return 'Ждём поездку от хоста.';
  if (trip?.event === undefined) return 'Поездка не собрана.';

  const lines = [
    `${trip.event.event.title}, ${trip.event.event.city ?? 'город не указан'}`,
    `${trip.stay?.checkIn ?? ''} - ${trip.stay?.checkOut ?? ''}`,
    ...trip.packages.map((item) => {
      const hotel = item.variant.hotel?.hotel;
      const stay =
        hotel === undefined
          ? 'без отеля'
          : `${hotel.name}, ${hotel.price.amount} ${hotel.price.currency} за проживание`;
      return (
        `${item.rules.join(' + ')}: ${item.variant.cost.total} ${item.variant.cost.currency}, ` +
        `${item.variant.outbound.mode} туда, ${stay}, ${item.variant.back.mode} обратно`
      );
    }),
  ];
  return lines.map((line) => escapeHtml(line)).join('<br />');
}

/**
 * What the board actually needs, and nothing else.
 *
 * The domain result carries the handles the checkout builder works with - `checkoutRef` with its
 * `search_id` and offer hashes - and the English message a source wrote for the logs. The screen
 * rebuilds a checkout from the request, never from those handles, so they are dropped here
 * rather than handed to a browser and to an MCP host along with the picture.
 */
export function boardPayload(trip: TripResult) {
  return {
    ...trip,
    sourceNotes: trip.sourceNotes.map(({ source, what, reason }) => ({ source, what, reason })),
    packages: trip.packages.map((item) => ({
      ...item,
      variant: {
        ...item.variant,
        outbound: withoutRef(item.variant.outbound),
        back: withoutRef(item.variant.back),
        ...(item.variant.hotel === undefined
          ? {}
          : {
              hotel: {
                ...item.variant.hotel,
                hotel: withoutRef(item.variant.hotel.hotel),
              },
            }),
      },
    })),
  };
}

function withoutRef<T extends { readonly checkoutRef?: unknown }>(value: T): Omit<T, 'checkoutRef'> {
  const rest: Record<string, unknown> = { ...value };
  delete rest['checkoutRef'];
  return rest as Omit<T, 'checkoutRef'>;
}

export function renderShell(options: ShellOptions): string {
  const data =
    options.trip === undefined
      ? ''
      : `\n    <script type="application/json" id="trip-data">${escapeJson(boardPayload(options.trip))}</script>`;

  // The request that produced this screen, ready to be changed. Server-rendered and plain GET,
  // so it works before any script runs and shares its result as a link. A host gets no form:
  // inside one, asking again is the agent's job, not the page's.
  const request = options.trip?.request;
  const ask =
    options.channel !== 'web'
      ? ''
      : `
    <form class="ask" method="get" action="/" role="search">
      <label class="ask__field">
        <span class="ask__label">Тема</span>
        <input class="ask__input" name="topics" value="${escapeHtml((request?.topics ?? []).join(', '))}" placeholder="ai, data" />
      </label>
      <label class="ask__field">
        <span class="ask__label">Откуда</span>
        <input class="ask__input" name="origin" value="${escapeHtml(request?.origin ?? '')}" placeholder="Москва" />
      </label>
      <label class="ask__field ask__field--narrow">
        <span class="ask__label">Бюджет, ₽</span>
        <input class="ask__input" name="budget" type="number" min="0" step="1000" value="${request?.budget ?? ''}" placeholder="30000" />
      </label>
      <button class="ask__go" type="submit">Собрать поездку</button>
    </form>`;

  // In a host the bridge is fetched here rather than by the board's own dynamic import, so the
  // transport is up before the host sends its first notification. On the web it is never fetched.
  const bridge =
    options.channel === 'app'
      ? `\n    <script type="module" src="${options.assets.script.replace(/boot\.js$/, 'vendor/mcp-apps/app.js')}"></script>`
      : '';

  return `<!doctype html>
<html lang="ru">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${escapeHtml(options.title)}</title>
    <link rel="stylesheet" href="${options.assets.tokens}" />
    <link rel="stylesheet" href="${options.assets.leaflet}" />
    <link rel="stylesheet" href="${options.assets.styles}" />
  </head>
  <body data-channel="${options.channel}">
    <noscript class="fallback">${fallbackText(options.trip, options.problem, options.channel)}</noscript>${ask}
    <div id="board" class="board" aria-live="polite"></div>${data}
    <script src="${options.assets.leaflet.replace('.css', '.js')}"></script>${bridge}
    <script type="module" src="${options.assets.script}"></script>
  </body>
</html>
`;
}
