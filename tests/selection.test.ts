import { describe, expect, it } from 'vitest';
import { describeCoverage, selectEvents } from '../src/composer/selection.ts';
import type { CatalogueEvent, CityDirectory, ResolvedCity } from '../src/composer/types.ts';

const MOSCOW: ResolvedCity = { title: 'Москва', slug: 'moscow' };

function event(overrides: Partial<CatalogueEvent> & { id: number }): CatalogueEvent {
  return {
    title: `Событие ${overrides.id}`,
    startDate: '2026-09-10',
    endDate: '2026-09-10',
    format: 'offline',
    topics: ['ai'],
    city: 'Казань',
    citySlug: 'kazan',
    ...overrides,
  };
}

function narrow(events: readonly CatalogueEvent[], extra: { asOf?: string; dateTo?: string } = {}) {
  return selectEvents({
    events,
    origin: MOSCOW,
    asOf: extra.asOf ?? '2026-08-19',
    ...(extra.dateTo === undefined ? {} : { dateTo: extra.dateTo }),
  });
}

describe('selectEvents', () => {
  it('builds no trip for an online event', () => {
    const result = narrow([event({ id: 1, format: 'online' })]);

    expect(result.primary).toBeUndefined();
  });

  it('says an online event was dropped because no travel is needed', () => {
    const result = narrow([event({ id: 1, format: 'online' })]);

    expect(result.skipped).toEqual([{ reason: 'online', events: [{ id: 1, title: 'Событие 1' }] }]);
  });

  it('keeps the link to a dropped event so the traveller can still open it', () => {
    const result = narrow([
      event({ id: 1, format: 'online', url: 'https://example.test/event' }),
    ]);

    expect(result.skipped[0]?.events[0]).toEqual({
      id: 1,
      title: 'Событие 1',
      url: 'https://example.test/event',
    });
  });

  it('builds no trip for an offline event the catalogue named no city for', () => {
    const nowhere: CatalogueEvent = {
      id: 1,
      title: 'Где-то',
      startDate: '2026-09-10',
      endDate: '2026-09-10',
      format: 'offline',
      topics: ['ai'],
    };

    expect(narrow([nowhere]).skipped[0]?.reason).toBe('no-destination');
  });

  it('drops one self-contradictory record without losing the rest of the catalogue', () => {
    const result = narrow([
      event({ id: 1, startDate: '2026-09-10', endDate: '2026-08-01' }),
      event({ id: 2, startDate: '2026-09-11', endDate: '2026-09-11' }),
    ]);

    expect(result.primary?.id).toBe(2);
  });

  it('names the self-contradictory record instead of swallowing it', () => {
    const result = narrow([
      event({ id: 1, startDate: '2026-09-10', endDate: '2026-08-01' }),
      event({ id: 2, startDate: '2026-09-11', endDate: '2026-09-11' }),
    ]);

    expect(result.skipped).toContainEqual({
      reason: 'unreadable',
      events: [{ id: 1, title: 'Событие 1' }],
    });
  });

  it('builds no trip for an event in the origin city', () => {
    const result = narrow([event({ id: 1, city: 'Москва', citySlug: 'moscow' })]);

    expect(result.skipped[0]?.reason).toBe('origin-city');
  });

  it('recognises the origin city by its title when the catalogue gave no slug', () => {
    const noSlug: CatalogueEvent = {
      id: 1,
      title: 'Событие 1',
      startDate: '2026-09-10',
      endDate: '2026-09-10',
      format: 'offline',
      topics: ['ai'],
      city: 'москва ',
    };

    expect(narrow([noSlug]).skipped[0]?.reason).toBe('origin-city');
  });

  it('does not confuse a different city with the origin', () => {
    const result = narrow([event({ id: 1, city: 'Московская область', citySlug: 'mo' })]);

    expect(result.primary?.id).toBe(1);
  });

  it('drops an event whose arrival day is already in the past', () => {
    // Opens in the morning, so the traveller would have had to arrive yesterday.
    const result = narrow(
      [event({ id: 1, startDate: '2026-08-19', endDate: '2026-08-19', startsAt: '2026-08-19T10:00:00+03:00' })],
      { asOf: '2026-08-19' },
    );

    expect(result.skipped[0]?.reason).toBe('unreachable');
  });

  it('keeps an event that can still be reached today', () => {
    // Opens in the evening, so today's arrival still works.
    const result = narrow(
      [event({ id: 1, startDate: '2026-08-19', endDate: '2026-08-19', startsAt: '2026-08-19T19:00:00+03:00' })],
      { asOf: '2026-08-19' },
    );

    expect(result.primary?.id).toBe(1);
  });

  it('drops an event that starts after the traveller can travel', () => {
    const result = narrow([event({ id: 1, startDate: '2026-11-20', endDate: '2026-11-22' })], {
      dateTo: '2026-09-30',
    });

    expect(result.skipped[0]?.reason).toBe('outside-window');
  });

  it('keeps an event that starts exactly on the last day the traveller can travel', () => {
    const result = narrow([event({ id: 1, startDate: '2026-09-30', endDate: '2026-09-30' })], {
      dateTo: '2026-09-30',
    });

    expect(result.primary?.id).toBe(1);
  });

  it('drops an event that starts before the traveller can travel', () => {
    const result = selectEvents({
      events: [event({ id: 1, startDate: '2026-08-25', endDate: '2026-08-25' })],
      origin: MOSCOW,
      asOf: '2026-08-19',
      dateFrom: '2026-09-01',
    });

    expect(result.skipped[0]?.reason).toBe('outside-window');
  });

  it('offers the nearest event first', () => {
    const result = narrow([
      event({ id: 1, startDate: '2026-10-01', endDate: '2026-10-01' }),
      event({ id: 2, startDate: '2026-09-01', endDate: '2026-09-01' }),
    ]);

    expect(result.primary?.id).toBe(2);
  });

  it('orders two events on the same day by catalogue id, so the answer never wobbles', () => {
    const later = event({ id: 7 });
    const earlier = event({ id: 3 });

    expect(narrow([later, earlier]).primary?.id).toBe(3);
    expect(narrow([earlier, later]).primary?.id).toBe(3);
  });

  it('offers at most five events', () => {
    const many = Array.from({ length: 9 }, (_, index) =>
      event({ id: index + 1, startDate: `2026-09-0${index + 1}`, endDate: `2026-09-0${index + 1}` }),
    );

    const result = narrow(many);

    expect(1 + result.alternatives.length).toBe(5);
  });

  it('accounts for every event past the cap instead of truncating the list silently', () => {
    const many = Array.from({ length: 9 }, (_, index) =>
      event({ id: index + 1, startDate: `2026-09-0${index + 1}`, endDate: `2026-09-0${index + 1}` }),
    );

    const overflow = narrow(many).skipped.find((note) => note.reason === 'over-the-cap');

    expect(overflow?.events.map((item) => item.id)).toEqual([6, 7, 8, 9]);
  });

  it('puts the nearest event first and the rest behind it', () => {
    const result = narrow([
      event({ id: 1, startDate: '2026-09-01', endDate: '2026-09-01' }),
      event({ id: 2, startDate: '2026-09-02', endDate: '2026-09-02' }),
    ]);

    expect(result.primary?.id).toBe(1);
    expect(result.alternatives.map((item) => item.id)).toEqual([2]);
  });

  it('explains an empty catalogue rather than answering nothing', () => {
    expect(narrow([]).emptyReason).toBe('catalogue-empty');
  });

  it('explains that everything on offer was online', () => {
    const result = narrow([event({ id: 1, format: 'online' }), event({ id: 2, format: 'online' })]);

    expect(result.emptyReason).toBe('all-online');
  });

  it('explains that everything on offer was already at home', () => {
    const result = narrow([event({ id: 1, city: 'Москва', citySlug: 'moscow' })]);

    expect(result.emptyReason).toBe('all-in-origin-city');
  });

  it('explains a mixed set of reasons without picking a misleading one', () => {
    const result = narrow([
      event({ id: 1, format: 'online' }),
      event({ id: 2, city: 'Москва', citySlug: 'moscow' }),
    ]);

    expect(result.emptyReason).toBe('nothing-left');
  });

  it('says nothing about an empty reason when a trip was found', () => {
    expect(narrow([event({ id: 1 })]).emptyReason).toBeUndefined();
  });

  it('treats a hybrid event as one worth travelling to', () => {
    expect(narrow([event({ id: 1, format: 'hybrid' })]).primary?.id).toBe(1);
  });

  it('answers the same whichever order the catalogue happened to list the events in', () => {
    const events = [
      event({ id: 2, startDate: '2026-09-01', endDate: '2026-09-01' }),
      event({ id: 1, startDate: '2026-09-01', endDate: '2026-09-01' }),
      event({ id: 3, startDate: '2026-09-01', endDate: '2026-09-01' }),
    ];

    const forwards = narrow(events);
    const backwards = narrow([...events].reverse());

    expect(forwards).toEqual(backwards);
    expect(forwards.primary?.id).toBe(1);
  });
});

describe('describeCoverage', () => {
  const directory: CityDirectory = {
    citiesTotal: 21,
    onlineEvents: 40,
    cities: [
      { slug: 'moscow', title: 'Москва', upcomingEvents: 162 },
      { slug: 'spb', title: 'Санкт-Петербург', upcomingEvents: 58 },
      { slug: 'kazan', title: 'Казань', upcomingEvents: 4 },
      { slug: 'perm', title: 'Пермь', upcomingEvents: 0 },
    ],
  };

  const whole: CityDirectory = { ...directory, citiesTotal: 4 };

  it('reports how many cities the catalogue lists at all', () => {
    expect(describeCoverage(whole).citiesListed).toBe(4);
  });

  it('reports how many of them actually have events', () => {
    expect(describeCoverage(whole).citiesWithEvents).toBe(3);
  });

  it('names the busiest cities in order', () => {
    expect(describeCoverage(whole).busiestCities.map((city) => city.title)).toEqual([
      'Москва',
      'Санкт-Петербург',
      'Казань',
    ]);
  });

  it('counts the upcoming events that have no city to travel to', () => {
    expect(describeCoverage(whole).onlineEvents).toBe(40);
  });

  it('does not let one page of the directory speak for the whole catalogue', () => {
    // Four cities out of twenty-one: saying "3 cities have events" here would be a fifth of
    // the truth dressed up as all of it.
    const coverage = describeCoverage(directory);

    expect(coverage).toEqual({
      citiesListed: 21,
      busiestCities: [],
      onlineEvents: 40,
      countsCoverWholeDirectory: false,
    });
  });

  it('says plainly when its counts do cover the whole directory', () => {
    expect(describeCoverage(whole).countsCoverWholeDirectory).toBe(true);
  });
});
