import assert from 'node:assert/strict';
import { Given, Then, When } from '@cucumber/cucumber';
import { computeStayDates, type EventSchedule, type StayDates } from '../../src/composer/dates.ts';
import { loadPayload } from '../support/fixtures.ts';
import type { ZaezdWorld } from '../support/world.ts';

const EVENTS_FIXTURE = 'confcal/events-ai-offline.json';

type RecordedEvent = {
  readonly title: string;
  readonly start_date: string;
  readonly end_date: string;
  readonly starts_at: string | null;
};

/** A time of day written the way the catalogue writes it, in Moscow time, or "unknown". */
function scheduleFrom(from: string, to: string, opens: string, closes?: string): EventSchedule {
  return {
    startDate: from,
    endDate: to,
    ...(opens === 'unknown' ? {} : { startsAt: `${from}T${opens}:00+03:00` }),
    ...(closes === undefined ? {} : { endsAt: `${to}T${closes}:00+03:00` }),
  };
}

Given(
  'an event running from {word} to {word} that opens at {word}',
  function (this: ZaezdWorld, from: string, to: string, opens: string) {
    this.remember('schedule', scheduleFrom(from, to, opens));
  },
);

Given(
  'an event running from {word} to {word} that opens at {word} and closes at {word}',
  function (this: ZaezdWorld, from: string, to: string, opens: string, closes: string) {
    this.remember('schedule', scheduleFrom(from, to, opens, closes));
  },
);

Given(
  'the recorded catalogue of offline events on artificial intelligence',
  function (this: ZaezdWorld) {
    const { items } = loadPayload<{ items: RecordedEvent[] }>(EVENTS_FIXTURE);
    this.remember('catalogue', items);
  },
);

When('the stay is computed', function (this: ZaezdWorld) {
  this.remember('stay', computeStayDates(this.recall<EventSchedule>('schedule')));
});

When('the stay is computed for {string}', function (this: ZaezdWorld, title: string) {
  const event = this.recall<RecordedEvent[]>('catalogue').find((item) => item.title === title);
  assert.ok(event !== undefined, `the recorded catalogue has no event titled "${title}"`);

  this.remember(
    'stay',
    computeStayDates({
      startDate: event.start_date,
      endDate: event.end_date,
      ...(event.starts_at === null ? {} : { startsAt: event.starts_at }),
    }),
  );
});

When('the stay is computed three times', function (this: ZaezdWorld) {
  const schedule = this.recall<EventSchedule>('schedule');
  this.remember('stays', [
    computeStayDates(schedule),
    computeStayDates(schedule),
    computeStayDates(schedule),
  ]);
});

Then('the traveller arrives on {word}', function (this: ZaezdWorld, day: string) {
  assert.equal(this.recall<StayDates>('stay').checkIn, day);
});

Then('the traveller leaves on {word}', function (this: ZaezdWorld, day: string) {
  assert.equal(this.recall<StayDates>('stay').checkOut, day);
});

Then('the stay is {int} nights', function (this: ZaezdWorld, nights: number) {
  assert.equal(this.recall<StayDates>('stay').nights, nights);
});

Then('the outbound journey is booked for {word}', function (this: ZaezdWorld, day: string) {
  assert.equal(this.recall<StayDates>('stay').outboundDate, day);
});

Then('the return journey is booked for {word}', function (this: ZaezdWorld, day: string) {
  assert.equal(this.recall<StayDates>('stay').returnDate, day);
});

Then('the trip needs no hotel', function (this: ZaezdWorld) {
  assert.equal(this.recall<StayDates>('stay').needsHotel, false);
});

Then('the trip says the opening time is unknown', function (this: ZaezdWorld) {
  assert.equal(this.recall<StayDates>('stay').openingTimeKnown, false);
});

Then('the trip says the closing time is unknown', function (this: ZaezdWorld) {
  assert.equal(this.recall<StayDates>('stay').closingTimeKnown, false);
});

Then('all three answers are identical', function (this: ZaezdWorld) {
  const [first, second, third] = this.recall<StayDates[]>('stays');
  assert.deepEqual(second, first);
  assert.deepEqual(third, first);
});
