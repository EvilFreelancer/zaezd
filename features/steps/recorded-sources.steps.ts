import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { Given, Then, When } from '@cucumber/cucumber';
import { TTL, TtlCache, cacheKey } from '../../src/sources/cache.ts';
import { loadRecordings, type Recordings } from '../../src/sources/replay.ts';
import { SourceError } from '../../src/sources/normalize.ts';
import type { ZaezdWorld } from '../support/world.ts';

const MINUTE = 60_000;

type Ask = { readonly topics: unknown };

/** A stand-in for the catalogue that counts how often it was actually asked. */
type Counter = { calls: number; failFirst: boolean };

function counter(world: ZaezdWorld): Counter {
  if (!world.scratch.has('counter')) world.remember('counter', { calls: 0, failFirst: false });
  return world.recall<Counter>('counter');
}

function cache(world: ZaezdWorld): TtlCache {
  if (!world.scratch.has('cache')) {
    world.remember('now', 0);
    world.remember('cache', new TtlCache({ clock: () => world.recall<number>('now') }));
  }
  return world.recall<TtlCache>('cache');
}

function asks(world: ZaezdWorld): Ask[] {
  return world.scratch.has('asks') ? world.recall<Ask[]>('asks') : [];
}

function addAsk(world: ZaezdWorld, topics: unknown): void {
  world.remember('asks', [...asks(world), { topics }]);
}

async function ask(world: ZaezdWorld, topics: unknown): Promise<string> {
  const state = counter(world);
  return cache(world).through(cacheKey('confcal', 'search_events', { topics }), TTL.catalogueEvents, async () => {
    state.calls += 1;
    if (state.failFirst && state.calls === 1) throw new Error('the catalogue did not answer');
    return 'события каталога';
  });
}

Given('the topics arrive as the list {word} and {word}', function (this: ZaezdWorld, one: string, two: string) {
  addAsk(this, [one, two]);
});

Given('the topics arrive as the list {word}', function (this: ZaezdWorld, one: string) {
  addAsk(this, [one]);
});

Given('the same topics arrive again as a JSON string', function (this: ZaezdWorld) {
  addAsk(this, '["ai","data"]');
});

Given('the same topics arrive again separated by commas', function (this: ZaezdWorld) {
  addAsk(this, 'ai, data');
});

Given('the same topics arrive again in the opposite order', function (this: ZaezdWorld) {
  addAsk(this, ['data', 'ai']);
});

Given('the catalogue was asked {int} minutes ago', async function (this: ZaezdWorld, minutes: number) {
  this.remember('now', 0);
  await ask(this, ['ai']);
  this.remember('now', minutes * MINUTE);
});

Given('the catalogue fails the first time and answers the second', function (this: ZaezdWorld) {
  counter(this).failFirst = true;
});

Given('two callers ask the catalogue at the same moment', function (this: ZaezdWorld) {
  addAsk(this, ['ai']);
  addAsk(this, ['ai']);
  addAsk(this, ['ai']);
});

Given('the recorded sources are loaded', function (this: ZaezdWorld) {
  this.remember('recordings', loadRecordings());
});

When('the catalogue is asked each time', async function (this: ZaezdWorld) {
  const answers: string[] = [];
  for (const item of asks(this)) answers.push(await ask(this, item.topics));
  this.remember('answers', answers);
});

When('the catalogue is asked again', async function (this: ZaezdWorld) {
  this.remember('answers', [await ask(this, ['ai'])]);
});

When('the catalogue is asked, and asked again after it failed', async function (this: ZaezdWorld) {
  const answers: string[] = [];
  for (const attempt of [1, 2]) {
    try {
      answers.push(await ask(this, ['ai']));
    } catch {
      answers.push(`attempt ${attempt} failed`);
    }
  }
  this.remember('answers', answers);
});

When('both wait for their answer', async function (this: ZaezdWorld) {
  this.remember('answers', await Promise.all(asks(this).map((item) => ask(this, item.topics))));
});

When('the recorded catalogue answer is looked up', function (this: ZaezdWorld) {
  this.remember(
    'looked-up',
    this.recall<Recordings>('recordings').envelope('confcal', 'search_events', {
      cities: ['ekaterinburg', 'kazan', 'spb', 'novosibirsk'],
      topics: ['ai'],
      event_format: 'offline',
      limit: 20,
    }),
  );
});

When('the recorded checkout answer is looked up', function (this: ZaezdWorld) {
  const manifest = JSON.parse(readFileSync('fixtures/manifest.json', 'utf8')) as {
    entries: readonly { source: string; tool: string; arguments: Record<string, unknown> }[];
  };
  const recorded = manifest.entries.find((entry) => entry.tool === 'create_checkout_link');
  assert.ok(recorded !== undefined, 'no checkout link was ever recorded');

  this.remember(
    'volatile',
    this.recall<Recordings>('recordings').isVolatile(
      recorded.source,
      recorded.tool,
      recorded.arguments,
    ),
  );
});

When('an unrecorded question is looked up and refused', function (this: ZaezdWorld) {
  try {
    this.recall<Recordings>('recordings').envelope('confcal', 'search_events', { topics: ['нет'] });
    this.remember('refusal', undefined);
  } catch (error) {
    this.remember('refusal', error);
  }
});

Then('the catalogue is asked once', function (this: ZaezdWorld) {
  assert.equal(counter(this).calls, 1);
});

Then('the catalogue is asked twice', function (this: ZaezdWorld) {
  assert.equal(counter(this).calls, 2);
});

Then('all three callers get the same answer', function (this: ZaezdWorld) {
  const answers = this.recall<string[]>('answers');
  assert.ok(answers.every((answer) => answer === answers[0]));
});

Then('the second answer arrives', function (this: ZaezdWorld) {
  assert.equal(this.recall<string[]>('answers')[1], 'события каталога');
});

Then('the recorded answer is returned', function (this: ZaezdWorld) {
  assert.ok(this.recall<unknown>('looked-up') !== undefined);
});

Then('the reference date is the day the recordings were made', function (this: ZaezdWorld) {
  const recordings = this.recall<Recordings>('recordings');
  assert.equal(recordings.referenceDate, recordings.recordedAt.slice(0, 10));
});

Then('the refusal says to record it', function (this: ZaezdWorld) {
  const refusal = this.recall<unknown>('refusal');
  assert.ok(refusal instanceof SourceError);
  assert.match(refusal.message, /npm run record/);
});

Then('the answer is marked as one that has most likely expired', function (this: ZaezdWorld) {
  assert.equal(this.recall<boolean>('volatile'), true);
});
