/**
 * The gateway: three verbs instead of sixteen searches.
 *
 * What faces an agent is a product contract - find a trip, open it, hand over the payment
 * checklist - not a re-export of somebody else's search tools. That is also the difference
 * between a manifest of 102 143 characters and one an agent can hold alongside everything else
 * it is doing.
 *
 * This file only registers: the schemas live in `schemas.ts`, the mapping and the wording in
 * `shape.ts`, and nothing here computes a date or a price.
 *
 * Specified in `specs/06-mcp-shlyuz.md`.
 */
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import {
  registerAppResource,
  registerAppTool,
  RESOURCE_MIME_TYPE,
} from '@modelcontextprotocol/ext-apps/server';
import type { App } from '../app.ts';
import { decodeTripId, encodeTripId, TripIdError } from '../composer/trip-id.ts';
import { toText } from '../sources/arguments.ts';
import type { TripRequest } from '../composer/types.ts';
import { boardPayload, renderShell } from '../web/render.ts';
import { CHECKOUT_META_KEY, TRIP_META_KEY } from '../web/client/contract.ts';
import { RULE_NAMES } from '../web/client/copy.ts';
import {
  CHECKOUT_INPUT,
  CHECKOUT_OUTPUT,
  DETAILS_INPUT,
  DETAILS_OUTPUT,
  FIND_INPUT,
  FIND_OUTPUT,
} from './schemas.ts';
import { detailsOf, pickPackage, requestFrom, shapeTrip, textFor, PART_NAMES } from './shape.ts';

export const UI_RESOURCE = 'ui://zaezd/trip-board';

/**
 * Where the widget finds the trip.
 *
 * `structuredContent` is written for the model: flat, small, snake_case. The board is drawn by
 * the same renderer the public link uses, and that renderer eats the board payload, so that
 * payload travels beside the answer under a namespaced key rather than being reshaped into a
 * second view model that would drift from the first.
 */
export { TRIP_META_KEY, CHECKOUT_META_KEY };

export function createMcpServer(app: App, publicUrl: string): McpServer {
  const server = new McpServer(
    { name: 'zaezd', version: '0.1.0' },
    { capabilities: { tools: {}, resources: {} } },
  );

  const linkFor = (request: TripRequest): { id: string; url: string } => {
    const id = encodeTripId({ request });
    return { id, url: `${publicUrl.replace(/\/$/, '')}/t/${id}` };
  };

  registerAppTool(
    server,
    'find_event_trips',
    {
      title: 'Найти поездку на конференцию',
      description:
        'Собирает поездку от повода: находит ближайшее офлайн-событие по теме, считает дорогу ' +
        'туда и обратно, отель и полную цену участия, и возвращает до трёх объяснимых пакетов.',
      inputSchema: FIND_INPUT,
      outputSchema: FIND_OUTPUT,
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true },
      _meta: { ui: { resourceUri: UI_RESOURCE, visibility: ['model', 'app'] } },
    },
    async (args) => {
      const request = requestFrom(args as Record<string, unknown>);
      const trip = await app.assemble(request);
      const link = linkFor(request);
      const shaped = shapeTrip(trip, link.id, link.url);

      return {
        content: [{ type: 'text', text: textFor(shaped) }],
        structuredContent: shaped,
        _meta: { [TRIP_META_KEY]: boardPayload(trip) },
      };
    },
  );

  registerAppTool(
    server,
    'get_trip_details',
    {
      title: 'Раскрыть пакет поездки',
      description: 'Подробности одного пакета: дороги, отель, запас до начала и погода, если она есть.',
      inputSchema: DETAILS_INPUT,
      outputSchema: DETAILS_OUTPUT,
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true },
      _meta: { ui: { resourceUri: UI_RESOURCE, visibility: ['model', 'app'] } },
    },
    async (args) => {
      const { request } = decodeTripId(String((args as Record<string, unknown>)['trip_id']));
      const trip = await app.assemble(request);
      const only = pickPackage(trip, toText((args as Record<string, unknown>)['package']));

      const link = linkFor(request);
      const shaped = {
        ...shapeTrip({ ...trip, packages: only }, link.id, link.url),
        ...detailsOf(trip),
      };
      return {
        content: [{ type: 'text', text: textFor(shaped) }],
        structuredContent: shaped,
        // The board keeps every package. Narrowing it here would shrink a widget the host
        // already drew from the search, in front of whoever is looking at it.
        _meta: { [TRIP_META_KEY]: boardPayload(trip) },
      };
    },
  );

  server.registerTool(
    'create_trip_checkout',
    {
      title: 'Собрать ссылки на оплату',
      description:
        'Чек-лист из двух-трёх ссылок Туту. Подпись каждой берётся из фактического kind, ' +
        'который вернул Туту, а корзину заводит сам человек в своей сессии.',
      inputSchema: CHECKOUT_INPUT,
      outputSchema: CHECKOUT_OUTPUT,
      // Honest: it changes nothing on our side, and the links it returns expire.
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: false },
    },
    async (args) => {
      const tripId = String((args as Record<string, unknown>)['trip_id']);
      const { request } = decodeTripId(tripId);
      const trip = await app.assemble(request);

      const chosen = pickPackage(trip, toText((args as Record<string, unknown>)['package']))[0];
      if (chosen === undefined) {
        throw new Error('Для этой поездки не собран ни один пакет, оплачивать нечего');
      }

      const links = await app.checkout(trip, chosen.variant);
      const shaped = {
        trip_id: tripId,
        variant_id: chosen.variant.id,
        rules: [...chosen.rules],
        links: links.map((link) => ({
          part: link.part,
          url: link.url,
          label: link.label,
          opens_a_cart: link.opensACart,
          ...(link.kind === undefined ? {} : { kind: link.kind }),
          ...(link.caveat === undefined ? {} : { caveat: link.caveat }),
          ...(link.recorded === undefined ? {} : { recorded: link.recorded }),
        })),
      };

      // A checklist read out loud must carry its warnings, or the caveat lives only in a field
      // a text host never prints and the traveller opens a search expecting a cart.
      const written = [
        `Пакет: ${chosen.rules.map((rule) => RULE_NAMES[rule] ?? rule).join(' + ')}`,
        ...links.flatMap((link) => [
        `${PART_NAMES[link.part] ?? link.part}: ${link.label}`,
        `  ${link.url}`,
        ...(link.caveat === undefined ? [] : [`  ${link.caveat}`]),
        ...(link.recorded === true ? ['  ссылка из записи, скорее всего уже протухла'] : []),
        ]),
      ];

      return {
        content: [{ type: 'text', text: written.join('\n') }],
        structuredContent: shaped,
        _meta: { [CHECKOUT_META_KEY]: links },
      };
    },
  );

  /**
   * One resource, not three. The App loads it independently of the tool call and receives the
   * result afterwards, so the shell ships without data and the renderer fills it in.
   */
  const ui = {
    csp: {
      // Everything the page loads or talks to, named. A host defaults to `default-src 'none'`,
      // so anything left out here simply does not appear.
      connectDomains: [publicUrl],
      resourceDomains: [
        publicUrl,
        'https://tile.openstreetmap.de',
        'https://cdn1.tu-tu.ru',
        'https://cdn2.tu-tu.ru',
      ],
    },
    prefersBorder: true,
  };

  registerAppResource(
    server,
    'trip-board',
    UI_RESOURCE,
    {
      title: 'Экран поездки',
      description: 'Тот же экран, что и на публичной ссылке.',
      _meta: { ui },
    },
    () => ({
      contents: [
        {
          uri: UI_RESOURCE,
          mimeType: RESOURCE_MIME_TYPE,
          // Hosts read this from the content item; the wrapper copy below is for the ones
          // that read it from the result. Both, because being wrong here means no tiles.
          _meta: { ui },
          text: renderShell({
            channel: 'app',
            title: 'Заезд',
            assets: {
              tokens: `${publicUrl}/vendor/kite/tutu-core.css`,
              styles: `${publicUrl}/styles.css`,
              script: `${publicUrl}/boot.js`,
              leaflet: `${publicUrl}/vendor/leaflet/leaflet.css`,
            },
          }),
        },
      ],
      _meta: { ui },
    }),
  );

  return server;
}

export { TripIdError };
