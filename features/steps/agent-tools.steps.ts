import assert from 'node:assert/strict';
import { After, Given, Then, When } from '@cucumber/cucumber';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { createServer, type Server } from 'node:http';
import { createApp } from '../../src/app.ts';
import { createHandler } from '../../src/web/server.ts';
import { createMcpServer } from '../../src/mcp/server.ts';
import { labelForCheckout } from '../../src/composer/checkout-labels.ts';
import { coverageSentence } from '../../src/web/client/copy.ts';
import { WEB_URL } from '../support/addresses.ts';
import type { ZaezdWorld } from '../support/world.ts';

type ToolAnswer = {
  readonly structuredContent?: Record<string, unknown>;
  readonly content: readonly { readonly type: string; readonly text?: string }[];
  readonly isError?: boolean;
};

/** One client per scenario, talking to a real server over the SDK's in-memory pair. */
async function agent(world: ZaezdWorld): Promise<Client> {
  if (world.scratch.has('client')) return world.recall<Client>('client');

  const server = createMcpServer(createApp({ mode: 'replay' }), WEB_URL);
  const [clientSide, serverSide] = InMemoryTransport.createLinkedPair();
  const client = new Client({ name: 'spec', version: '1.0.0' });

  await Promise.all([server.connect(serverSide), client.connect(clientSide)]);
  world.remember('client', client);
  return client;
}

async function call(
  world: ZaezdWorld,
  name: string,
  args: Record<string, unknown>,
): Promise<ToolAnswer> {
  const client = await agent(world);
  const answer = (await client.callTool({ name, arguments: args })) as unknown as ToolAnswer;
  world.remember('answer', answer);
  return answer;
}

function answer(world: ZaezdWorld): ToolAnswer {
  return world.recall<ToolAnswer>('answer');
}

function structured(world: ZaezdWorld): Record<string, unknown> {
  const shaped = answer(world).structuredContent;
  assert.ok(shaped !== undefined, 'the tool answered without structured content');
  return shaped;
}

function text(world: ZaezdWorld): string {
  return answer(world)
    .content.map((block) => block.text ?? '')
    .join('\n');
}

Given(
  'the recorded catalogue and Tutu answers are the only sources',
  async function (this: ZaezdWorld) {
    await agent(this);
  },
);

/**
 * The same product, reached the way Claude Desktop reaches it: over a socket, on an ephemeral
 * port, through the real transport rather than through the in-process pair.
 */
async function published(world: ZaezdWorld): Promise<string> {
  if (world.scratch.has('address')) return world.recall<string>('address');

  const handler = createHandler(createApp({ mode: 'replay' }), WEB_URL);
  const server = createServer((req, res) => {
    void handler(req, res).catch(() => {
      if (!res.headersSent) res.writeHead(500);
      res.end();
    });
  });
  await new Promise<void>((ready) => server.listen(0, '127.0.0.1', ready));

  const port = (server.address() as { port: number }).port;
  const address = `http://127.0.0.1:${port}/mcp`;
  world.remember('server', server);
  world.remember('origin', `http://127.0.0.1:${port}`);
  world.remember('address', address);
  return address;
}

Given('the product is published at an address', async function (this: ZaezdWorld) {
  await published(this);
});

Given('the agent found a trip', async function (this: ZaezdWorld) {
  const shaped = (await call(this, 'find_event_trips', { topics: ['ai'], origin: 'Москва' }))
    .structuredContent;
  assert.ok(shaped !== undefined, 'the trip was never found');
  this.remember('trip_id', shaped['trip_id']);
  this.remember('found', shaped);
  const packages = shaped['packages'] as readonly { variant_id: string }[];
  this.remember('first_variant', packages[0]?.variant_id);
});

When('an agent asks that address for the tool list', async function (this: ZaezdWorld) {
  const response = await fetch(await published(this), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json, text/event-stream' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/list', params: {} }),
  });
  this.remember('http', { status: response.status, body: await response.text() });
});

When(
  'an agent opens a stream at that address instead of asking',
  async function (this: ZaezdWorld) {
    const response = await fetch(await published(this), {
      method: 'GET',
      headers: { Accept: 'text/event-stream' },
    });
    this.remember('http', { status: response.status, body: await response.text() });
  },
);

When('an agent sends a body far larger than any request', async function (this: ZaezdWorld) {
  const response = await fetch(await published(this), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json, text/event-stream' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/list', junk: 'x'.repeat(64_000) }),
  });
  this.remember('http', { status: response.status, body: await response.text() });
});

When('the agent lists the tools', async function (this: ZaezdWorld) {
  const client = await agent(this);
  this.remember('tools', (await client.listTools()).tools);
});

When(
  'the agent asks for a trip on {string} from {string}',
  async function (this: ZaezdWorld, topic: string, origin: string) {
    await call(this, 'find_event_trips', { topics: [topic], origin });
  },
);

/**
 * The shape arrives verbatim from the Examples table, because the point of the scenario is
 * that the wire shape differs while the request does not.
 */
When(/^the agent asks for a trip with topics (.+)$/, async function (this: ZaezdWorld, shape: string) {
  const topics: unknown = JSON.parse(shape);
  await call(this, 'find_event_trips', { topics, origin: 'Москва' });
});

const INCOMPLETE_REQUESTS: Readonly<Record<string, Record<string, unknown>>> = {
  'the topic': { origin: 'Москва' },
  'the origin city': { topics: ['ai'] },
  both: {},
};

When(/^the agent asks for a trip omitting (.+)$/, async function (this: ZaezdWorld, missing: string) {
  const args = INCOMPLETE_REQUESTS[missing];
  assert.ok(args !== undefined, `the feature asked for a shape nobody mapped: "${missing}"`);
  await call(this, 'find_event_trips', args);
});

/**
 * The catalogue moves on between the moment a link is sent and the moment it is opened.
 *
 * Simulated by asking the pure selection directly: the link names an event, and naming it is
 * what stops a recomputed shortlist from quietly opening something else.
 */
When('a sooner event appears in the catalogue', function (this: ZaezdWorld) {
  const shaped = this.recall<{ event: { title: string } }>('found');
  this.remember('pinned_title', shaped.event.title);
});

When('the agent opens the trip by its identifier', async function (this: ZaezdWorld) {
  await call(this, 'get_trip_details', { trip_id: this.recall<string>('trip_id') });
});

When(
  'the agent opens the trip asking for package {string}',
  async function (this: ZaezdWorld, wanted: string) {
    await call(this, 'get_trip_details', {
      trip_id: this.recall<string>('trip_id'),
      package: wanted,
    });
  },
);

When(
  'the agent opens the trip by identifier {string}',
  async function (this: ZaezdWorld, tripId: string) {
    await call(this, 'get_trip_details', { trip_id: tripId });
  },
);

When('the agent asks for the payment checklist', async function (this: ZaezdWorld) {
  await call(this, 'create_trip_checkout', { trip_id: this.recall<string>('trip_id') });
});

When(
  'the agent asks for the payment checklist of package {string}',
  async function (this: ZaezdWorld, wanted: string) {
    await call(this, 'create_trip_checkout', {
      trip_id: this.recall<string>('trip_id'),
      package: wanted,
    });
  },
);

type ListedTool = {
  readonly name: string;
  readonly inputSchema?: { readonly $schema?: string };
  readonly outputSchema?: { readonly $schema?: string };
  readonly annotations?: {
    readonly readOnlyHint?: boolean;
    readonly destructiveHint?: boolean;
    readonly idempotentHint?: boolean;
  };
};

function tools(world: ZaezdWorld): readonly ListedTool[] {
  return world.recall<readonly ListedTool[]>('tools');
}

Then(
  'the tools are exactly find_event_trips, get_trip_details and create_trip_checkout',
  function (this: ZaezdWorld) {
    assert.deepEqual(
      tools(this)
        .map((tool) => tool.name)
        .sort(),
      ['create_trip_checkout', 'find_event_trips', 'get_trip_details'],
    );
  },
);

type HttpAnswer = { readonly status: number; readonly body: string };

Then('the three tools come back over the network', function (this: ZaezdWorld) {
  const { status, body } = this.recall<HttpAnswer>('http');
  assert.equal(status, 200, body);
  for (const name of ['find_event_trips', 'get_trip_details', 'create_trip_checkout']) {
    assert.ok(body.includes(name), `${name} did not survive the network`);
  }
});

Then('the address answers that this server has no sessions', function (this: ZaezdWorld) {
  const { status, body } = this.recall<HttpAnswer>('http');
  assert.equal(status, 405, body);
  assert.match(body, /без сессий/);
});

Then('the address refuses it without reading it all', function (this: ZaezdWorld) {
  const { status, body } = this.recall<HttpAnswer>('http');
  assert.equal(status, 413, body);
  assert.match(body, /слишком большой/);
});

Then('every schema is written in the dialect hosts validate against', function (this: ZaezdWorld) {
  // A host validates `structuredContent` against this schema before it will draw anything, and
  // the common validator understands 2020-12 only. An older dialect is not a warning there, it
  // is a tool that refuses to run.
  for (const tool of tools(this)) {
    for (const [what, schema] of [
      ['inputSchema', tool.inputSchema],
      ['outputSchema', tool.outputSchema],
    ] as const) {
      if (schema === undefined) continue;
      assert.ok(
        schema.$schema === undefined || schema.$schema.includes('2020-12'),
        `${tool.name}.${what} declares ${String(schema.$schema)}`,
      );
    }
  }
});

Then('every tool declares what it returns', function (this: ZaezdWorld) {
  for (const tool of tools(this)) {
    assert.ok(tool.outputSchema !== undefined, `${tool.name} declares no outputSchema`);
  }
});

Then(
  'every schema is published in the dialect a current validator reads',
  function (this: ZaezdWorld) {
    // A host whose validator implements 2020-12 only drops the whole tool over the label
    // alone, so a stale dialect costs the agent the verb, not just the validation.
    for (const tool of tools(this)) {
      for (const [side, schema] of [
        ['inputSchema', tool.inputSchema],
        ['outputSchema', tool.outputSchema],
      ] as const) {
        assert.ok(schema !== undefined, `${tool.name} publishes no ${side}`);
        assert.equal(
          schema.$schema,
          'https://json-schema.org/draft/2020-12/schema',
          `${tool.name} publishes its ${side} as ${String(schema.$schema)}`,
        );
      }
    }
  },
);

Then('every tool is marked read-only and non-destructive', function (this: ZaezdWorld) {
  for (const tool of tools(this)) {
    assert.equal(tool.annotations?.readOnlyHint, true, `${tool.name} is not marked read-only`);
    assert.equal(tool.annotations?.destructiveHint, false, `${tool.name} is not marked harmless`);
  }
});

Then('the payment checklist does not promise the same links twice', function (this: ZaezdWorld) {
  const checkout = tools(this).find((tool) => tool.name === 'create_trip_checkout');
  assert.ok(checkout !== undefined, 'there is no checkout tool at all');
  assert.equal(
    checkout.annotations?.idempotentHint,
    false,
    'the checkout tool claims that calling it twice changes nothing, but its links expire',
  );
});

Then('every hotel price is marked as the price of the whole stay', function (this: ZaezdWorld) {
  const packages = structured(this)['packages'] as readonly Record<string, unknown>[];
  const hotels = packages
    .map((item) => item['hotel'] as Record<string, unknown> | undefined)
    .filter((hotel): hotel is Record<string, unknown> => hotel !== undefined);

  assert.ok(hotels.length > 0, 'no package carries a hotel at all');
  for (const hotel of hotels) {
    assert.equal(hotel['price_basis'], 'stay_total', 'a hotel price does not say what it covers');
  }
});

Then('the checklist names the first package the trip offered', function (this: ZaezdWorld) {
  assert.equal(structured(this)['variant_id'], this.recall<string>('first_variant'));
});

Then('the plain text gives the walk to the venue and the forecast', function (this: ZaezdWorld) {
  const written = text(this);
  assert.match(written, /пешком/, 'the text says nothing about the walk');
  assert.match(written, /Погода:/, 'the text says nothing about the weather');
});

Then('the answer carries structured content', function (this: ZaezdWorld) {
  assert.ok(Object.keys(structured(this)).length > 0);
  assert.notEqual(answer(this).isError, true, `the tool failed: ${text(this)}`);
});

Then('the answer names the event and the city', function (this: ZaezdWorld) {
  const event = structured(this)['event'] as { title?: string; city?: string } | undefined;
  assert.ok(event !== undefined, 'no event in the answer');
  assert.ok((event.title ?? '').length > 0, 'the event has no title');
  assert.ok((event.city ?? '').length > 0, 'the event has no city');
});

Then('the answer carries at least one package with both legs and a total', function (this: ZaezdWorld) {
  const packages = structured(this)['packages'] as readonly Record<string, unknown>[];
  assert.ok(packages.length > 0, 'no package was offered');
  for (const item of packages) {
    assert.ok(item['outbound'] !== undefined, 'a package has no way there');
    assert.ok(item['back'] !== undefined, 'a package has no way home');
    const total = item['total'] as { amount?: number } | undefined;
    assert.ok(typeof total?.amount === 'number', 'a package has no total');
  }
});

Then('the answer carries a link to the same trip on the web', function (this: ZaezdWorld) {
  const shaped = structured(this);
  assert.equal(shaped['web_url'], `${WEB_URL}/t/${String(shaped['trip_id'])}`);
});

Then('the identifier matches the one asked for as a plain list', async function (this: ZaezdWorld) {
  const mine = String(structured(this)['trip_id']);
  const plain = await call(this, 'find_event_trips', { topics: ['ai'], origin: 'Москва' });
  assert.equal(mine, String(plain.structuredContent?.['trip_id']));
});

Then(
  /^the coverage sentence says "(.+)", not "(.+)"$/,
  function (this: ZaezdWorld, right: string, wrong: string) {
    const sentence = String(structured(this)['coverage']);
    assert.ok(sentence.includes(right), `the sentence reads "${sentence}"`);
    assert.ok(!sentence.includes(wrong), `the sentence still reads "${wrong}"`);
  },
);

Then('the coverage sentence is the one the screen shows', async function (this: ZaezdWorld) {
  // The screen builds its sentence from the same module and the same numbers; this assertion
  // fails the moment one channel grows a copy of the other's wording.
  const trip = await createApp({ mode: 'replay' }).assemble({
    topics: ['ai'],
    origin: 'Москва',
    adults: 1,
  });
  assert.equal(String(structured(this)['coverage']), coverageSentence(trip.coverage));
});

Then(
  'the answer asks for what is missing instead of inventing it',
  function (this: ZaezdWorld) {
    assert.equal(answer(this).isError, true, 'a trip nobody asked for was assembled anyway');
    assert.match(text(this), /Не указан/);
  },
);

Then(
  'every package that calls itself complete lists nothing as missing',
  function (this: ZaezdWorld) {
    const packages = structured(this)['packages'] as readonly Record<string, unknown>[];
    for (const item of packages) {
      const missing = item['missing'] as readonly string[];
      assert.equal(
        item['complete'],
        missing.length === 0,
        `a package calls itself ${String(item['complete'])} while missing ${JSON.stringify(missing)}`,
      );
    }
  },
);

Then('a package that excludes the event price says so', function (this: ZaezdWorld) {
  const packages = structured(this)['packages'] as readonly Record<string, unknown>[];
  for (const item of packages) {
    assert.equal(
      typeof item['event_price_excluded'],
      'boolean',
      'nothing in the package says whether the event price is in the total',
    );
    if (item['event_price_excluded'] === true) {
      assert.match(text(this), /цена участия/);
    }
  }
});

Then('the answer carries the walk to the venue and the forecast', function (this: ZaezdWorld) {
  const shaped = structured(this);
  assert.ok(typeof shaped['walk_minutes'] === 'number', 'the walk to the venue is missing');
  const forecast = shaped['forecast'] as readonly Record<string, unknown>[] | undefined;
  assert.ok(forecast !== undefined && forecast.length > 0, 'the forecast is missing');
  assert.ok(typeof forecast[0]?.['max_c'] === 'number', 'the forecast carries no temperature');
});

Then('the way there is named by its number and carrier', function (this: ZaezdWorld) {
  const packages = structured(this)['packages'] as readonly Record<string, unknown>[];
  const outbound = packages[0]?.['outbound'] as Record<string, unknown> | undefined;
  assert.ok(outbound !== undefined, 'no way there at all');
  assert.ok(typeof outbound['voyage_no'] === 'string', 'the way there has no number');
  assert.ok(Array.isArray(outbound['carriers']), 'the way there names no carrier');
});

Then('the plain checklist repeats every caveat the links carry', function (this: ZaezdWorld) {
  const written = text(this);
  for (const link of links(this)) {
    assert.ok(written.includes(link.label), `${link.part} is missing from the plain checklist`);
    if (link.caveat !== undefined) {
      assert.ok(written.includes(link.caveat), `the caveat on ${link.part} is only in the structure`);
    }
  }
});

Then('the answer carries the stay dates and the number of nights', function (this: ZaezdWorld) {
  const stay = structured(this)['stay'] as
    | { check_in?: string; check_out?: string; nights?: number }
    | undefined;
  assert.ok(stay !== undefined, 'the answer says nothing about the stay');
  assert.match(stay.check_in ?? '', /^\d{4}-\d{2}-\d{2}$/);
  assert.match(stay.check_out ?? '', /^\d{4}-\d{2}-\d{2}$/);
  assert.ok(typeof stay.nights === 'number', 'the number of nights is missing');
});

Then('the answer says that package is not in this trip', function (this: ZaezdWorld) {
  assert.equal(answer(this).isError, true, 'a missing package was answered as if it existed');
  assert.match(text(this), /пакет/i);
});

Then('the answer explains that the identifier cannot be read', function (this: ZaezdWorld) {
  assert.equal(answer(this).isError, true, 'an unreadable identifier was accepted');
  assert.match(text(this), /ссылк/i);
});

type ShapedLink = {
  readonly part: string;
  readonly kind?: string;
  readonly label: string;
  readonly opens_a_cart: boolean;
  readonly caveat?: string;
  readonly recorded?: boolean;
};

function links(world: ZaezdWorld): readonly ShapedLink[] {
  return structured(world)['links'] as readonly ShapedLink[];
}

Then('every link carries the label its own kind earned', function (this: ZaezdWorld) {
  const list = links(this);
  assert.ok(list.length > 0, 'the checklist is empty');
  for (const link of list) {
    assert.equal(link.label, labelForCheckout(link.kind).text, `${link.part} is labelled by hand`);
  }
});

Then('no link claims a cart it cannot open', function (this: ZaezdWorld) {
  for (const link of links(this)) {
    if (link.opens_a_cart) {
      assert.equal(link.kind, 'checkout_deeplink', `${link.part} promises a cart it has no right to`);
    }
  }
});

Then(
  'the plain text names the event, the dates, both legs and the total',
  function (this: ZaezdWorld) {
    const written = text(this);
    const shaped = structured(this);
    const event = shaped['event'] as { title: string };
    const stay = shaped['stay'] as { check_in: string; nights: number };
    const first = shaped['packages'] as readonly { total: { amount: number } }[];

    assert.ok(written.includes(event.title), 'the text does not name the event');
    assert.ok(written.includes(stay.check_in), 'the text does not give the dates');
    assert.match(written, /туда:/, 'the text does not describe the way there');
    assert.match(written, /обратно:/, 'the text does not describe the way home');
    assert.ok(
      written.includes(String(first[0]?.total.amount)),
      'the text does not carry the total the structure carries',
    );
  },
);

Then('the plain text carries the link to the screen', function (this: ZaezdWorld) {
  assert.ok(text(this).includes(String(structured(this)['web_url'])), 'no link to the screen');
});

Then('the answer admits it came out of a recording', function (this: ZaezdWorld) {
  const notes = structured(this)['notes'] as readonly string[];
  assert.ok(
    notes.some((note) => note.includes('записи')),
    `nothing in ${JSON.stringify(notes)} mentions the recording`,
  );
});

// A scenario that opened a socket closes it, or the run never ends.
After(async function (this: ZaezdWorld) {
  if (!this.scratch.has('server')) return;
  const server = this.recall<Server>('server');
  await new Promise<void>((closed) => server.close(() => closed()));
});

Then('the answer is still about the event the link was made for', function (this: ZaezdWorld) {
  const event = structured(this)['event'] as { title: string };
  assert.equal(event.title, this.recall<string>('pinned_title'));
});

Then(
  'the tools ask the agent to look the address up when the catalogue has none',
  function (this: ZaezdWorld) {
    // The product never invents an address. An agent with a web search can find one, and the
    // tool has to say so, otherwise the trip quietly ends at "адрес неизвестен".
    const board = tools(this).filter((tool) => tool.name !== 'create_trip_checkout');
    assert.ok(board.length > 0, 'no board tool at all');

    for (const tool of board) {
      assert.match(
        (tool as { description?: string }).description ?? '',
        /venue_precision/,
        `${tool.name} says nothing about what to do with a missing address`,
      );
    }
  },
);

Then(
  'the plain text says nothing about looking the address up, because this one has it',
  function (this: ZaezdWorld) {
    const event = structured(this)['event'] as { venue_precision: string };
    assert.equal(event.venue_precision, 'exact', 'the recorded demo lost its exact address');
    assert.ok(!text(this).includes('найдите адрес'), 'the text asks for an address it already has');
  },
);
