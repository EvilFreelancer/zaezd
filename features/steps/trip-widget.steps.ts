import assert from 'node:assert/strict';
import { Then, When } from '@cucumber/cucumber';
import { UI_RESOURCE } from '../../src/mcp/server.ts';
import { CHECKOUT_META_KEY, TRIP_META_KEY } from '../../src/web/client/contract.ts';
import { createApp } from '../../src/app.ts';
import { boardPayload, renderShell } from '../../src/web/render.ts';
import type { TripResult } from '../../src/composer/build-trip.ts';
import { WEB_URL } from '../support/addresses.ts';
import type { ZaezdWorld } from '../support/world.ts';

/**
 * The steps here read the resource and the tool result the way a host does. What happens after
 * the page loads - the handshake, the recompute, the opened link - is browser behaviour and is
 * checked with a browser, not with Cucumber on Node.
 */
type ResourceContents = {
  readonly contents: readonly {
    readonly uri: string;
    readonly mimeType?: string;
    readonly text?: string;
    readonly _meta?: Record<string, unknown>;
  }[];
  readonly _meta?: Record<string, unknown>;
};

function resource(world: ZaezdWorld): ResourceContents {
  return world.recall<ResourceContents>('resource');
}

function page(world: ZaezdWorld): string {
  return resource(world).contents[0]?.text ?? '';
}

When('the agent reads the trip board resource', async function (this: ZaezdWorld) {
  const client = await this.recall<{
    readResource(params: { uri: string }): Promise<unknown>;
  }>('client').readResource({ uri: UI_RESOURCE });

  this.remember('resource', client as ResourceContents);
});

When('the widget asks that address for the renderer', async function (this: ZaezdWorld) {
  const response = await fetch(`${this.recall<string>('origin')}/boot.js`);
  this.remember('renderer', {
    status: response.status,
    allowOrigin: response.headers.get('access-control-allow-origin'),
  });
});

Then('the renderer is allowed to load into a page from anywhere', function (this: ZaezdWorld) {
  const answer = this.recall<{ status: number; allowOrigin: string | null }>('renderer');
  assert.equal(answer.status, 200);
  // An app runs in a sandboxed frame with an opaque origin, and a module script is fetched in
  // CORS mode. Without this the board works on the web and stays blank inside a host.
  assert.equal(answer.allowOrigin, '*', 'a host would not be allowed to load the renderer');
});

Then('the resource is served as an app page', function (this: ZaezdWorld) {
  assert.equal(resource(this).contents[0]?.mimeType, 'text/html;profile=mcp-app');
  assert.match(page(this), /<html lang="ru">/);
});

Then('the page carries no trip inside it', function (this: ZaezdWorld) {
  assert.ok(!page(this).includes('id="trip-data"'), 'the shell arrived with data baked in');
  assert.match(page(this), /data-channel="app"/);
});

Then('the page loads the same renderer as the public link', function (this: ZaezdWorld) {
  assert.match(page(this), /<script type="module" src="[^"]*\/boot\.js"><\/script>/);
});

Then('the answer carries the whole trip for the widget to draw', function (this: ZaezdWorld) {
  const meta = this.recall<{ _meta?: Record<string, unknown> }>('answer')._meta;
  assert.ok(meta !== undefined, 'the answer carries no metadata at all');

  const trip = meta[TRIP_META_KEY] as TripResult | undefined;
  assert.ok(trip !== undefined, `nothing under ${TRIP_META_KEY} for the widget`);
  assert.ok(trip.packages.length > 0, 'the trip beside the answer has no packages');
  this.remember('widget_trip', trip);
});

Then('the trip beside the answer is the one the public link would show', async function (
  this: ZaezdWorld,
) {
  const shown = await createApp({ mode: 'replay' }).assemble({
    topics: ['ai'],
    origin: 'Москва',
    adults: 1,
  });

  // The same payload, not merely a similar one: the page embeds this and the widget receives it.
  const beside = JSON.stringify(this.recall<TripResult>('widget_trip'));
  assert.equal(
    beside,
    JSON.stringify(boardPayload(shown)),
    'the widget and the public link would draw different trips',
  );

  const embedded = renderShell({ channel: 'web', title: 'Заезд', trip: shown, assets: ASSETS });
  assert.ok(embedded.includes('trip-data'), 'the public link embeds no trip at all');
  this.remember('board_payload', beside);
});

Then('the trip beside the answer carries nothing a board cannot draw', function (this: ZaezdWorld) {
  const beside = this.recall<string>('board_payload');
  // Payment handles are rebuilt from the request when somebody clicks; shipping them to a host
  // hands over search identifiers and offer hashes for a picture that never uses them.
  assert.ok(!beside.includes('checkoutRef'), 'the payment handles travelled with the picture');
  assert.ok(!beside.includes('"message"'), 'an English log line travelled with the picture');
});

const ASSETS = {
  styles: '/styles.css',
  script: '/boot.js',
  leaflet: '/vendor/leaflet/leaflet.css',
};

type ResourceMeta = {
  readonly ui?: {
    readonly csp?: {
      readonly connectDomains?: readonly string[];
      readonly resourceDomains?: readonly string[];
    };
  };
};

function uiMeta(world: ZaezdWorld): ResourceMeta['ui'] {
  const meta = resource(world)._meta as ResourceMeta | undefined;
  assert.ok(meta?.ui !== undefined, 'the resource declares no UI metadata');
  return meta.ui;
}

Then('the resource names our own address as the one it talks to', function (this: ZaezdWorld) {
  const connect = uiMeta(this)?.csp?.connectDomains ?? [];
  assert.ok(connect.includes(WEB_URL), `our address is not among ${JSON.stringify(connect)}`);
});

Then('the resource allows the map tiles it draws', function (this: ZaezdWorld) {
  const allowed = uiMeta(this)?.csp?.resourceDomains ?? [];
  assert.ok(allowed.includes(WEB_URL), 'the page could not load its own renderer');
  assert.ok(
    allowed.some((domain) => domain.includes('tile.')),
    'map tiles would be blocked',
  );
});

Then('the page itself carries the same permissions, where a host reads them', function (
  this: ZaezdWorld,
) {
  // Hosts differ on where they look; the one that reads the content item must find it too.
  const onItem = resource(this).contents[0]?._meta as ResourceMeta | undefined;
  assert.deepEqual(onItem?.ui, uiMeta(this), 'the permissions live in only one of the two places');
});

Then('the answer names one package for the model', function (this: ZaezdWorld) {
  const shaped = this.recall<{ structuredContent?: Record<string, unknown> }>('answer')
    .structuredContent;
  const packages = shaped?.['packages'] as readonly unknown[];
  assert.equal(packages.length, 1, 'the model was not given the package it asked for');
});

Then('the board beside the answer still carries every package', function (this: ZaezdWorld) {
  const trip = this.recall<{ _meta?: Record<string, unknown> }>('answer')._meta?.[
    TRIP_META_KEY
  ] as TripResult | undefined;
  assert.ok(trip !== undefined, 'no board travelled with the answer');
  assert.ok(
    trip.packages.length > 1,
    'opening one package would shrink a board the host already drew',
  );
});

Then('no trip travels beside the checklist', function (this: ZaezdWorld) {
  const meta = this.recall<{ _meta?: Record<string, unknown> }>('answer')._meta ?? {};
  assert.equal(meta[TRIP_META_KEY], undefined, 'the checklist would wipe the board it sits on');
});

Then('the checklist travels in the shape the screen already renders', function (this: ZaezdWorld) {
  const links = this.recall<{ _meta?: Record<string, unknown> }>('answer')._meta?.[
    CHECKOUT_META_KEY
  ] as readonly { opensACart?: boolean }[] | undefined;
  assert.ok(links !== undefined && links.length > 0, 'the widget would have to parse it twice');
  assert.equal(typeof links[0]?.opensACart, 'boolean', 'the screen would not understand this');
});

type UiToolMeta = {
  readonly ui?: { readonly resourceUri?: string };
  readonly 'ui/resourceUri'?: string;
};

Then(/^(\w+) (points|does not point) at the trip board$/, function (
  this: ZaezdWorld,
  name: string,
  points: string,
) {
  const tool = this.recall<readonly { name: string; _meta?: UiToolMeta }[]>('tools').find(
    (listed) => listed.name === name,
  );
  assert.ok(tool !== undefined, `there is no tool called ${name}`);

  const declared = tool._meta?.ui?.resourceUri ?? tool._meta?.['ui/resourceUri'];
  if (points === 'points') {
    assert.equal(declared, UI_RESOURCE, `${name} does not offer the board`);
  } else {
    assert.equal(declared, undefined, `${name} offers a board it has nothing to draw`);
  }
});
