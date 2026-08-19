import assert from 'node:assert/strict';
import { Given, Then, When } from '@cucumber/cucumber';
import { renderShell, type Channel } from '../../src/web/render.ts';
import { buildTrip, type TripResult } from '../../src/composer/build-trip.ts';
import { TtlCache } from '../../src/sources/cache.ts';
import { confcalClient } from '../../src/sources/confcal.ts';
import { tutuClient } from '../../src/sources/tutu.ts';
import { replayTransport } from '../../src/sources/mcp-client.ts';
import { loadRecordings } from '../../src/sources/replay.ts';
import { replayHttp, type HttpFetch } from '../../src/enrich/http.ts';
import type { ZaezdWorld } from '../support/world.ts';

const ASSETS = {
  tokens: '/vendor/kite/tutu-core.css',
  styles: '/styles.css',
  script: '/boot.js',
  leaflet: '/vendor/leaflet/leaflet.css',
};

function enrichment(): HttpFetch {
  const recordings = loadRecordings();
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

async function assembleFromRecordings(): Promise<TripResult> {
  const recordings = loadRecordings();
  const cache = new TtlCache({ clock: () => 0 });
  const enrich = { http: enrichment(), cache };

  return buildTrip(
    { topics: ['ai'], origin: 'Москва', adults: 1 },
    {
      confcal: confcalClient({ transport: replayTransport('confcal', recordings), cache }),
      tutu: tutuClient({ transport: replayTransport('tutu', recordings), cache }),
      geo: enrich,
      calendar: enrich,
      weather: enrich,
      asOf: recordings.referenceDate,
      computedAt: recordings.recordedAt,
      mode: 'replay',
    },
  );
}

Given('the recorded trip is ready to show', async function (this: ZaezdWorld) {
  this.remember('trip', await assembleFromRecordings());
});

Given('an event named {string}', async function (this: ZaezdWorld, name: string) {
  const trip = await assembleFromRecordings();
  assert.ok(trip.event !== undefined, 'the recordings assembled no trip');

  // A hostile name is exactly what a catalogue could return tomorrow, so it is put where one
  // would arrive rather than into a hand-built object.
  this.remember('trip', {
    ...trip,
    event: { ...trip.event, event: { ...trip.event.event, title: name } },
  });
});

Given('the link cannot be read', function (this: ZaezdWorld) {
  this.remember('problem', 'Эту ссылку не удалось прочитать');
});

function render(world: ZaezdWorld, channel: Channel): void {
  const trip = world.scratch.has('trip') ? world.recall<TripResult>('trip') : undefined;
  const problem = world.scratch.has('problem') ? world.recall<string>('problem') : undefined;

  world.remember(
    'html',
    renderShell({
      channel,
      title: trip?.event === undefined ? 'Заезд' : `${trip.event.event.title} — Заезд`,
      ...(trip === undefined || channel === 'app' ? {} : { trip }),
      ...(problem === undefined ? {} : { problem }),
      assets: ASSETS,
    }),
  );
}

When('the page is rendered', function (this: ZaezdWorld) {
  render(this, 'web');
});

When('the page is rendered for an agent', function (this: ZaezdWorld) {
  render(this, 'app');
});

function html(world: ZaezdWorld): string {
  return world.recall<string>('html');
}

Then('the page is titled after {string}', function (this: ZaezdWorld, title: string) {
  assert.match(html(this), new RegExp(`<title>${title}[^<]*</title>`));
});

Then('the trip is embedded in the page', function (this: ZaezdWorld) {
  assert.match(html(this), /<script type="application\/json" id="trip-data">/);
});

Then('the trip is not embedded in the page', function (this: ZaezdWorld) {
  assert.ok(!html(this).includes('id="trip-data"'));
});

Then(
  'the page carries a readable summary for a reader without scripting',
  function (this: ZaezdWorld) {
    const noscript = /<noscript class="fallback">([\s\S]*?)<\/noscript>/.exec(html(this));
    assert.ok(noscript !== null, 'there is no fallback at all');
    assert.ok((noscript[1] ?? '').length > 20, 'the fallback says nothing useful');
  },
);

Then(/^the page contains no unescaped (.+)$/, function (this: ZaezdWorld, fragment: string) {
  assert.ok(!html(this).includes(fragment), `"${fragment}" reached the page unescaped`);
});

Then('the page explains what went wrong', function (this: ZaezdWorld) {
  assert.match(html(this), /не удалось прочитать/);
});

Then('the page loads the same renderer as the web page', function (this: ZaezdWorld) {
  assert.ok(html(this).includes(ASSETS.script));
});

Then('the page carries the asked-for topic and origin, filled in', function (this: ZaezdWorld) {
  const page = html(this);
  assert.match(page, /<form[^>]*class="ask"/, 'there is nothing to change the request with');
  assert.match(page, /name="topics"[^>]*value="ai"/, 'the topic is not filled in');
  assert.match(page, /name="origin"[^>]*value="Москва"/, 'the origin is not filled in');
});

Then('the origin can be typed rather than picked from a list', function (this: ZaezdWorld) {
  // A dropdown of cities would be a promise that we know which ones work. We do not.
  assert.ok(!/<select[^>]*name="origin"/.test(html(this)), 'the origin pretends to be a closed list');
});

Then('the fallback names the hotel and its price', function (this: ZaezdWorld) {
  const noscript = /<noscript class="fallback">([\s\S]*?)<\/noscript>/.exec(html(this));
  assert.ok(noscript !== null, 'there is no fallback at all');
  assert.match(noscript[1] ?? '', /Номера у Невы/, 'the fallback does not name the hotel');
});

Then('the page loads the vendored Tutu tokens before its own styles', function (this: ZaezdWorld) {
  const page = html(this);
  const tokens = page.indexOf(ASSETS.tokens);
  const styles = page.indexOf(ASSETS.styles);

  // Without this sheet every --tutu-* falls back to nothing and the whole palette quietly
  // disappears, which is exactly how it shipped before anyone measured a computed colour.
  assert.ok(tokens !== -1, 'the token sheet is not loaded at all');
  assert.ok(tokens < styles, 'our styles would be read before the tokens they use');
});
