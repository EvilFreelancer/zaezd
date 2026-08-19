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
  readonly assets: { readonly styles: string; readonly script: string; readonly leaflet: string };
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
function fallbackText(trip: TripResult | undefined, problem: string | undefined): string {
  if (problem !== undefined) return escapeHtml(problem);
  if (trip?.event === undefined) return 'Поездка не собрана.';

  const lines = [
    `${trip.event.event.title}, ${trip.event.event.city ?? 'город не указан'}`,
    `${trip.stay?.checkIn ?? ''} - ${trip.stay?.checkOut ?? ''}`,
    ...trip.packages.map(
      (item) => `${item.variant.cost.total} ${item.variant.cost.currency}, вариант ${item.variant.id}`,
    ),
  ];
  return lines.map((line) => escapeHtml(line)).join('<br />');
}

export function renderShell(options: ShellOptions): string {
  const data =
    options.trip === undefined
      ? ''
      : `\n    <script type="application/json" id="trip-data">${escapeJson(options.trip)}</script>`;

  return `<!doctype html>
<html lang="ru">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${escapeHtml(options.title)}</title>
    <link rel="stylesheet" href="${options.assets.leaflet}" />
    <link rel="stylesheet" href="${options.assets.styles}" />
  </head>
  <body data-channel="${options.channel}">
    <noscript class="fallback">${fallbackText(options.trip, options.problem)}</noscript>
    <div id="board" class="board" aria-live="polite"></div>${data}
    <script src="${options.assets.leaflet.replace('.css', '.js')}"></script>
    <script type="module" src="${options.assets.script}"></script>
  </body>
</html>
`;
}
