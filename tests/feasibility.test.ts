import { describe, expect, it } from 'vitest';
import { checkFeasibility } from '../src/composer/feasibility.ts';

const MORNING_EVENT = {
  startDate: '2026-08-27',
  endDate: '2026-08-29',
  startsAt: '2026-08-27T10:00:00+03:00',
};

describe('checkFeasibility, arriving in time', () => {
  it('accepts an arrival exactly the required margin before the opening', () => {
    const result = checkFeasibility({
      event: MORNING_EVENT,
      arrivalAt: '2026-08-27T09:00:00+03:00',
    });

    expect(result).toMatchObject({ makesTheOpening: true, marginMinutes: 60 });
  });

  it('refuses an arrival half a minute short of the margin instead of rounding it up', () => {
    // 59 minutes 30 seconds rounds to 60, and rounding here would wave through a traveller
    // who does not in fact have the hour the check exists to guarantee.
    const result = checkFeasibility({
      event: MORNING_EVENT,
      arrivalAt: '2026-08-27T09:00:30+03:00',
    });

    expect(result.makesTheOpening).toBe(false);
  });

  it('never overstates the margin it reports', () => {
    const result = checkFeasibility({
      event: MORNING_EVENT,
      arrivalAt: '2026-08-27T09:00:30+03:00',
    });

    expect(result.marginMinutes).toBe(59);
  });

  it('reports a negative margin for an arrival after the opening', () => {
    const result = checkFeasibility({
      event: MORNING_EVENT,
      arrivalAt: '2026-08-27T11:30:00+03:00',
    });

    expect(result).toMatchObject({ makesTheOpening: false, marginMinutes: -90 });
  });

  it('compares moments rather than wall clocks across time zones', () => {
    // 07:30+03:00 is 09:30+05:00, half an hour before a 10:00+05:00 opening: too late.
    const result = checkFeasibility({
      event: { startDate: '2026-08-27', endDate: '2026-08-27', startsAt: '2026-08-27T10:00:00+05:00' },
      arrivalAt: '2026-08-27T07:30:00+03:00',
    });

    expect(result).toMatchObject({ makesTheOpening: false, marginMinutes: 30 });
  });

  it('honours a margin the caller asked for instead of the default hour', () => {
    const result = checkFeasibility({
      event: MORNING_EVENT,
      arrivalAt: '2026-08-27T09:30:00+03:00',
      requiredMarginMinutes: 30,
    });

    expect(result.makesTheOpening).toBe(true);
  });
});

describe('checkFeasibility, what it will not claim', () => {
  it('says nothing about the opening when the catalogue gave no opening time', () => {
    const result = checkFeasibility({
      event: { startDate: '2026-10-29', endDate: '2026-10-31' },
      arrivalAt: '2026-10-28T18:00:00+03:00',
    });

    expect(result.makesTheOpening).toBeUndefined();
  });

  it('still offers a variant as the main trip when only the opening time is missing', () => {
    const result = checkFeasibility({
      event: { startDate: '2026-10-29', endDate: '2026-10-31' },
      arrivalAt: '2026-10-28T18:00:00+03:00',
    });

    expect(result).toMatchObject({ canBePrimary: true });
    expect(result.notes).toEqual(['opening-time-unknown']);
  });

  it('treats an unreadable opening time as no opening time at all', () => {
    const result = checkFeasibility({
      event: { startDate: '2026-08-27', endDate: '2026-08-27', startsAt: 'утром' },
      arrivalAt: '2026-08-27T08:00:00+03:00',
    });

    expect(result.notes).toContain('opening-time-unknown');
  });

  it('refuses to headline a variant whose arrival time nobody can read', () => {
    const result = checkFeasibility({ event: MORNING_EVENT, arrivalAt: 'сегодня-вечером' });

    expect(result.makesTheOpening).toBeUndefined();
    expect(result).toMatchObject({ canBePrimary: false, notes: ['arrival-time-unreadable'] });
  });

  it('reports no margin at all when there is nothing to measure', () => {
    const result = checkFeasibility({ event: MORNING_EVENT });

    expect(result.marginMinutes).toBeUndefined();
  });
});

describe('checkFeasibility, leaving after the event', () => {
  const withClosing = {
    startDate: '2026-08-27',
    endDate: '2026-08-29',
    endsAt: '2026-08-29T18:00:00+03:00',
  };

  it('accepts a departure exactly when the event closes', () => {
    const result = checkFeasibility({
      event: withClosing,
      returnDepartureAt: '2026-08-29T18:00:00+03:00',
    });

    expect(result.leavesAfterTheEnd).toBe(true);
  });

  it('flags a departure a minute before the event closes', () => {
    const result = checkFeasibility({
      event: withClosing,
      returnDepartureAt: '2026-08-29T17:59:00+03:00',
    });

    expect(result).toMatchObject({ leavesAfterTheEnd: false, canBePrimary: false });
  });

  it('flags a departure on a day before the event ends when no closing time is known', () => {
    const result = checkFeasibility({
      event: { startDate: '2026-08-27', endDate: '2026-08-29' },
      returnDepartureAt: '2026-08-28T09:00:00+03:00',
    });

    expect(result.leavesAfterTheEnd).toBe(false);
  });

  it('accepts a departure on the day after the event ends', () => {
    const result = checkFeasibility({
      event: { startDate: '2026-08-27', endDate: '2026-08-29' },
      returnDepartureAt: '2026-08-30T09:00:00+03:00',
    });

    expect(result.leavesAfterTheEnd).toBe(true);
  });

  it('will not judge a departure on the last day without a closing time', () => {
    const result = checkFeasibility({
      event: { startDate: '2026-08-27', endDate: '2026-08-29' },
      returnDepartureAt: '2026-08-29T21:00:00+03:00',
    });

    expect(result.leavesAfterTheEnd).toBeUndefined();
    expect(result.canBePrimary).toBe(true);
    expect(result.notes).toContain('closing-time-unknown');
  });

  it('refuses to headline a variant whose return time nobody can read', () => {
    const result = checkFeasibility({ event: withClosing, returnDepartureAt: 'вечером' });

    expect(result.canBePrimary).toBe(false);
  });
});

describe('checkFeasibility, both ends at once', () => {
  it('accepts a trip that makes the opening and leaves after the end', () => {
    const result = checkFeasibility({
      event: { ...MORNING_EVENT, endsAt: '2026-08-29T18:00:00+03:00' },
      arrivalAt: '2026-08-26T20:00:00+03:00',
      returnDepartureAt: '2026-08-30T09:00:00+03:00',
    });

    expect(result).toMatchObject({
      makesTheOpening: true,
      leavesAfterTheEnd: true,
      canBePrimary: true,
    });
  });

  it('refuses a trip that makes the opening but leaves before the end', () => {
    const result = checkFeasibility({
      event: { ...MORNING_EVENT, endsAt: '2026-08-29T18:00:00+03:00' },
      arrivalAt: '2026-08-26T20:00:00+03:00',
      returnDepartureAt: '2026-08-28T09:00:00+03:00',
    });

    expect(result.canBePrimary).toBe(false);
  });

  it('answers identically every time it is asked', () => {
    const input = {
      event: MORNING_EVENT,
      arrivalAt: '2026-08-26T20:00:00+03:00',
      returnDepartureAt: '2026-08-30T09:00:00+03:00',
    };

    expect(checkFeasibility(input)).toEqual(checkFeasibility(input));
  });
});
