/**
 * Records the payloads every specification, every unit test and `ZAEZD_MODE=replay` run on.
 *
 * This is the only code in the repository allowed to touch the live network as a matter of
 * routine. It speaks raw JSON-RPC over streamable HTTP rather than going through
 * `src/sources/`, because the fixtures have to exist before the clients that parse them do.
 *
 *   npm run record                    # everything
 *   npm run record -- confcal         # one group: confcal | tutu | enrich
 *
 * The npm script passes `--use-env-proxy`, and it is not decoration. Unlike curl, Node
 * ignores `HTTPS_PROXY` unless told to read it, and on a machine behind a proxy the
 * difference is invisible until a response grows past a few kilobytes: small calls come back
 * and large ones hang until the socket times out. Run the script by hand and you will
 * reproduce exactly that.
 *
 * Every file is an envelope, never a bare payload. `recorded_at` is what `replay` uses as
 * "today", so a recorded event never quietly becomes a past event and reddens the suite.
 * `volatile` names the fields that expire (`checkout_ref`, `search_id`, ready-made checkout
 * URLs): they are good for parsing and are never checked for liveness.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

const CONFCAL_URL = process.env['ZAEZD_CONFCAL_URL'] ?? 'https://confcal.rpa.icu/mcp';
const TUTU_URL = process.env['ZAEZD_TUTU_URL'] ?? 'https://mcp.tutu.ru/mcp';
const CONTACT = process.env['ZAEZD_CONTACT_EMAIL'] ?? 'freelancerevil@gmail.com';
const USER_AGENT = `zaezd-recorder/0.1 (+https://zaezd.rpa.icu; ${CONTACT})`;

const FIXTURES = 'fixtures';
const RECORDED_AT = new Date().toISOString();

type Source = 'confcal' | 'tutu' | 'nominatim' | 'osrm' | 'isdayoff' | 'open-meteo';

type Envelope = {
  readonly recorded_at: string;
  readonly source: Source;
  readonly tool: string;
  readonly arguments: Readonly<Record<string, unknown>>;
  readonly note?: string;
  readonly volatile?: readonly string[];
  readonly response: unknown;
};

type ManifestEntry = Omit<Envelope, 'response'> & { readonly file: string };

const manifest: ManifestEntry[] = [];

function save(file: string, envelope: Envelope): void {
  const path = join(FIXTURES, file);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify(envelope, null, 2)}\n`);

  manifest.push({
    file,
    recorded_at: envelope.recorded_at,
    source: envelope.source,
    tool: envelope.tool,
    arguments: envelope.arguments,
    ...(envelope.note === undefined ? {} : { note: envelope.note }),
    ...(envelope.volatile === undefined ? {} : { volatile: envelope.volatile }),
  });
  console.warn(`recorded ${file}`);
}

/** A streamable-HTTP MCP body is either JSON or an SSE stream carrying one JSON frame. */
async function readMcpBody(response: Response): Promise<unknown> {
  const text = await response.text();
  if ((response.headers.get('content-type') ?? '').includes('text/event-stream')) {
    const frame = text
      .split('\n')
      .filter((line) => line.startsWith('data: '))
      .map((line) => line.slice('data: '.length))
      .join('');
    return JSON.parse(frame);
  }
  return JSON.parse(text);
}

async function rpc(
  url: string,
  method: string,
  params: Record<string, unknown>,
  headers: Readonly<Record<string, string>> = {},
): Promise<{ readonly body: unknown; readonly headers: Headers }> {
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json, text/event-stream',
      'User-Agent': USER_AGENT,
      ...headers,
    },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
    signal: AbortSignal.timeout(60_000),
  });
  return { body: await readMcpBody(response), headers: response.headers };
}

/**
 * The tool payload arrives as a JSON string inside a text block; Tutu declares no
 * `outputSchema`. Recording the inner object as well as the envelope keeps the fixtures
 * readable without teaching every reader that trick.
 */
function unwrapToolResult(body: unknown): unknown {
  const content = (body as { result?: { content?: { text?: string }[] } }).result?.content;
  const text = content?.[0]?.text;
  if (typeof text !== 'string') return body;
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

async function recordConfcal(): Promise<void> {
  // The handshake itself is a fixture: the session header is what the client has to learn.
  const initResponse = await fetch(CONFCAL_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json, text/event-stream',
      'User-Agent': USER_AGENT,
    },
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: 1,
      method: 'initialize',
      params: {
        protocolVersion: '2025-06-18',
        capabilities: {},
        clientInfo: { name: 'zaezd-recorder', version: '0.1.0' },
      },
    }),
  });
  const session = initResponse.headers.get('mcp-session-id') ?? '';
  save('confcal/initialize.json', {
    recorded_at: RECORDED_AT,
    source: 'confcal',
    tool: 'initialize',
    arguments: {},
    note: 'the session id arrives in the mcp-session-id response header, not in the body',
    volatile: ['headers.mcp-session-id'],
    response: {
      headers: { 'mcp-session-id': session },
      body: await readMcpBody(initResponse),
    },
  });

  const call = async (
    file: string,
    tool: string,
    args: Record<string, unknown>,
    note?: string,
  ): Promise<void> => {
    const { body } = await rpc(
      CONFCAL_URL,
      'tools/call',
      { name: tool, arguments: args },
      { 'mcp-session-id': session },
    );
    save(file, {
      recorded_at: RECORDED_AT,
      source: 'confcal',
      tool,
      arguments: args,
      ...(note === undefined ? {} : { note }),
      response: { envelope: body, payload: unwrapToolResult(body) },
    });
  };

  await call('confcal/list-cities.json', 'list_cities', { limit: 100, offset: 0 });
  await call('confcal/list-topics.json', 'list_topics', { limit: 100, offset: 0 });
  await call(
    'confcal/list-cities-page-2.json',
    'list_cities',
    { limit: 5, offset: 5 },
    'a second page, so coverage is not computed from page one and called the catalogue',
  );

  await call(
    'confcal/events-ai-offline.json',
    'search_events',
    {
      cities: ['ekaterinburg', 'kazan', 'spb', 'novosibirsk'],
      topics: ['ai'],
      event_format: 'offline',
      limit: 20,
    },
    'the default demo: a morning start with a real address, a null starts_at, a null venue',
  );
  await call(
    'confcal/events-ai-online.json',
    'search_events',
    { cities: ['online'], topics: ['ai'], event_format: 'online', limit: 5 },
    'online events build no trip and get their own message',
  );
  await call(
    'confcal/events-ai-moscow.json',
    'search_events',
    { cities: ['moscow'], topics: ['ai'], event_format: 'offline', limit: 5 },
    'events in the origin city are dropped with their own message',
  );
  await call(
    'confcal/events-empty.json',
    'search_events',
    { cities: ['krasnoyarsk'], topics: ['gamedev'], event_format: 'offline', limit: 5 },
    'an empty catalogue answer still owes the user a coverage note',
  );

  // A dead session: the client must re-initialize once and retry rather than surface this.
  const dead = await rpc(
    CONFCAL_URL,
    'tools/call',
    { name: 'list_cities', arguments: { limit: 1 } },
    { 'mcp-session-id': '00000000000000000000000000000000' },
  );
  save('confcal/session-lost.json', {
    recorded_at: RECORDED_AT,
    source: 'confcal',
    tool: 'list_cities',
    arguments: { limit: 1 },
    note: 'what an expired or unknown mcp-session-id looks like',
    response: dead.body,
  });
}

async function recordTutu(): Promise<void> {
  const call = async (
    file: string,
    tool: string,
    args: Record<string, unknown>,
    extra: { note?: string; volatile?: readonly string[] } = {},
  ): Promise<unknown> => {
    const { body } = await rpc(TUTU_URL, 'tools/call', { name: tool, arguments: args });
    const payload = unwrapToolResult(body);
    save(file, {
      recorded_at: RECORDED_AT,
      source: 'tutu',
      tool,
      arguments: args,
      ...extra,
      response: { envelope: body, payload },
    });
    return payload;
  };

  const volatileTransport = ['variants[].checkout_ref', 'variants[].checkout_url'];
  const volatileHotels = [
    'hotels[].checkout_ref',
    'hotels[].checkout_url',
    'hotels[].best_offer.checkout_url',
    'meta.search_id',
  ];

  // Default demo: Moscow to Yekaterinburg, event 197 on 2026-08-27 at 10:00.
  const outbound = await call(
    'tutu/multitransport-msk-ekb-out.json',
    'search_multitransport',
    { origin: 'Москва', destination: 'Екатеринбург', departure_date: '2026-08-26', page_size: 6 },
    { volatile: volatileTransport, note: 'outbound leg of the default demo' },
  );
  await call(
    'tutu/multitransport-ekb-msk-back.json',
    'search_multitransport',
    { origin: 'Екатеринбург', destination: 'Москва', departure_date: '2026-08-30', page_size: 6 },
    { volatile: volatileTransport, note: 'the return leg, without which the total is knowably wrong' },
  );
  const hotels = await call(
    'tutu/hotels-ekb.json',
    'search_hotels',
    {
      city_name: 'Екатеринбург',
      check_in: '2026-08-26',
      check_out: '2026-08-30',
      adults: 1,
      page_size: 20,
    },
    { volatile: volatileHotels },
  );

  // Degradation showcase: Kazan, event 277, null starts_at and null venue.
  await call(
    'tutu/multitransport-msk-kzn-out.json',
    'search_multitransport',
    { origin: 'Москва', destination: 'Казань', departure_date: '2026-10-28', page_size: 6 },
    { volatile: volatileTransport },
  );
  await call(
    'tutu/multitransport-kzn-msk-back.json',
    'search_multitransport',
    { origin: 'Казань', destination: 'Москва', departure_date: '2026-11-01', page_size: 6 },
    { volatile: volatileTransport },
  );
  await call(
    'tutu/hotels-kzn.json',
    'search_hotels',
    {
      city_name: 'Казань',
      check_in: '2026-10-28',
      check_out: '2026-11-01',
      adults: 1,
      page_size: 20,
    },
    { volatile: volatileHotels },
  );

  // A route with no direct anything, so "no return leg" is a recorded answer and not a guess.
  await call(
    'tutu/multitransport-thin-route.json',
    'search_multitransport',
    { origin: 'Иннополис', destination: 'Калининград', departure_date: '2026-10-28', page_size: 6 },
    { volatile: volatileTransport, note: 'a thin route: some modes come back empty while others live' },
  );

  // pydantic with extra=forbid rejects any unknown key; the gateway must never leak this raw.
  await call(
    'tutu/error-extra-key.json',
    'search_multitransport',
    { origin: 'Москва', destination: 'Казань', date: '2026-10-28' },
    { note: 'the validation error every agent hits sooner or later' },
  );

  await recordCheckouts(call, outbound, hotels);
}

type Ref = Readonly<Record<string, unknown>>;

type Variant = {
  readonly transport?: string;
  readonly checkout_ref?: Ref;
};

type Hotel = {
  readonly hotel_id?: string;
  readonly checkout_ref?: Ref;
};

type TutuCall = (
  file: string,
  tool: string,
  args: Record<string, unknown>,
  extra?: { note?: string; volatile?: readonly string[] },
) => Promise<unknown>;

/**
 * A checkout link per `kind`, because the button label is derived from the `kind` Tutu
 * actually returned and there is no way to test that against invented values.
 */
async function recordCheckouts(call: TutuCall, outbound: unknown, hotels: unknown): Promise<void> {
  const variants = (outbound as { variants?: Variant[] } | undefined)?.variants ?? [];
  const rail = variants.find((variant) => variant.transport === 'railway')?.checkout_ref;
  const avia = variants.find((variant) => variant.transport === 'avia')?.checkout_ref;
  const hotel = (hotels as { hotels?: Hotel[] } | undefined)?.hotels?.[0];

  if (rail !== undefined) {
    await call('tutu/checkout-rail.json', 'create_checkout_link', { ...rail }, {
      volatile: ['checkout_url'],
      note: 'rail without a seat choice; the kind decides the label, we do not',
    });
  }
  if (avia !== undefined) {
    await call('tutu/checkout-avia.json', 'create_checkout_link', { ...avia }, {
      volatile: ['checkout_url'],
      note: 'air: in a cold browser this lands on search, which is what the label must say',
    });
  }

  if (hotel?.checkout_ref === undefined || hotel.hotel_id === undefined) {
    console.error('no usable hotel row in the Yekaterinburg listing; hotel checkout not recorded');
    return;
  }

  await call('tutu/checkout-hotel-page.json', 'create_checkout_link', { ...hotel.checkout_ref }, {
    volatile: ['checkout_url'],
    note: 'no offer_pack_hash: this opens the hotel page and is not a cart, whatever we wish',
  });

  const details = await call(
    'tutu/offer-details-ekb.json',
    'get_offer_details',
    {
      product_type: 'hotels',
      offer_id: hotel.hotel_id,
      check_in: '2026-08-26',
      check_out: '2026-08-30',
      adults: 1,
    },
    {
      volatile: ['rooms[].rates[].offerpack_hash'],
      note: 'only a room rate offerpack_hash mints a cart; the listing best_offer one does not',
    },
  );

  const rate = (details as { rooms?: { rates?: { offerpack_hash?: string }[] }[] } | undefined)
    ?.rooms?.[0]?.rates?.[0]?.offerpack_hash;
  if (rate === undefined) {
    console.error('no room rate offerpack_hash in the details answer; the cart link was skipped');
    return;
  }
  await call(
    'tutu/checkout-hotel-cart.json',
    'create_checkout_link',
    { ...hotel.checkout_ref, offer_pack_hash: rate },
    { volatile: ['checkout_url'], note: 'with a room rate hash this really is a cart' },
  );
}

async function recordHttp(
  file: string,
  source: Source,
  tool: string,
  url: string,
  args: Record<string, unknown>,
  extra: { note?: string; volatile?: readonly string[] } = {},
): Promise<void> {
  const response = await fetch(url, {
    headers: { 'User-Agent': USER_AGENT, Accept: 'application/json' },
    signal: AbortSignal.timeout(30_000),
  });
  const text = await response.text();
  // isDayOff answers with a bare string of digits. JSON.parse would happily turn
  // "1100000110000011" into 1.1e15 and the calendar would be silently destroyed, so the
  // content type decides, not a try/catch.
  const isJson = (response.headers.get('content-type') ?? '').includes('json');
  let body: unknown = text;
  if (isJson) {
    try {
      body = JSON.parse(text);
    } catch {
      body = text;
    }
  }
  save(file, {
    recorded_at: RECORDED_AT,
    source,
    tool,
    arguments: { url, ...args },
    ...extra,
    response: { status: response.status, body },
  });
}

/** Nominatim bans anonymous traffic and asks for at most one request per second. */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function recordEnrich(): Promise<void> {
  const nominatim = (query: string): string =>
    `https://nominatim.openstreetmap.org/search?format=jsonv2&limit=5&q=${encodeURIComponent(query)}`;

  const venues: readonly (readonly [string, string, string])[] = [
    [
      'enrich/nominatim-venue-verbatim.json',
      'Городской молодёжный кластер «Салют», ул. Толмачёва, 12, Екатеринбург',
      'step one, the venue string as the catalogue wrote it: Nominatim returns nothing at all',
    ],
    [
      'enrich/nominatim-street.json',
      'ул. Толмачёва, 12, Екатеринбург',
      'step two, the address part pulled out of the venue string: this is what actually resolves',
    ],
    [
      'enrich/nominatim-company-name.json',
      'YADRO, Санкт-Петербург',
      'a company name resolves to something plausible and means little; precision must not be claimed',
    ],
    [
      'enrich/nominatim-city.json',
      'Екатеринбург',
      'step three, the city itself: a normal mode of operation, not an exception',
    ],
  ];
  for (const [file, query, note] of venues) {
    await recordHttp(file, 'nominatim', 'search', nominatim(query), { q: query }, { note });
    await sleep(1100);
  }

  // Kremlin to a hotel in Kazan: the same pair on both profiles, so a car answer relabelled
  // "N мин пешком" can be caught by a test rather than by a user.
  const pair = '49.119747,55.799152;49.108891,55.796127';
  await recordHttp(
    'enrich/osrm-foot.json',
    'osrm',
    'route-foot',
    `https://routing.openstreetmap.de/routed-foot/route/v1/foot/${pair}?overview=false`,
    { profile: 'foot' },
    { note: 'the only profile a walking time may come from' },
  );
  await recordHttp(
    'enrich/osrm-car.json',
    'osrm',
    'route-car',
    `https://router.project-osrm.org/route/v1/driving/${pair}?overview=false`,
    { profile: 'driving' },
    { note: 'the public demo server serves this profile only; it must never be shown as walking' },
  );

  for (const month of ['2026-08', '2026-09', '2026-10', '2026-11']) {
    const [year, mm] = month.split('-');
    await recordHttp(
      `enrich/isdayoff-${month}.json`,
      'isdayoff',
      'getdata',
      `https://isdayoff.ru/api/getdata?year=${year}&month=${mm}`,
      { year, month: mm },
      { note: 'one character per day, 0 working and 1 off' },
    );
  }

  await recordHttp(
    'enrich/openmeteo-in-window.json',
    'open-meteo',
    'forecast',
    'https://api.open-meteo.com/v1/forecast?latitude=56.8389&longitude=60.6057' +
      '&daily=temperature_2m_max,temperature_2m_min,precipitation_probability_max&timezone=auto' +
      '&start_date=2026-08-26&end_date=2026-08-30',
    { city: 'Екатеринбург' },
    { note: 'inside the 16-day forecast window at the time of recording' },
  );
  await recordHttp(
    'enrich/openmeteo-out-of-window.json',
    'open-meteo',
    'forecast',
    'https://api.open-meteo.com/v1/forecast?latitude=55.7963&longitude=49.1088' +
      '&daily=temperature_2m_max,temperature_2m_min,precipitation_probability_max&timezone=auto' +
      '&start_date=2026-10-28&end_date=2026-11-01',
    { city: 'Казань' },
    {
      note:
        'beyond the window Open-Meteo refuses the range outright and names the bounds; ' +
        'the block is hidden and history is never substituted',
    },
  );
}

async function main(): Promise<void> {
  const group = process.argv[2] ?? 'all';

  if (group === 'all' || group === 'confcal') await recordConfcal();
  if (group === 'all' || group === 'tutu') await recordTutu();
  if (group === 'all' || group === 'enrich') await recordEnrich();

  if (group === 'all') {
    writeFileSync(
      join(FIXTURES, 'manifest.json'),
      `${JSON.stringify({ recorded_at: RECORDED_AT, entries: manifest }, null, 2)}\n`,
    );
    console.warn(`wrote ${FIXTURES}/manifest.json with ${manifest.length} entries`);
  } else {
    console.warn('partial run: manifest.json was left alone, re-run without a group to refresh it');
  }
}

await main();
