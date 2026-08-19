import { describe, expect, it } from 'vitest';
import { computeStayDates } from '../src/composer/dates.ts';

describe('computeStayDates', () => {
  it('pulls the arrival one day earlier for an event opening before noon', () => {
    const stay = computeStayDates({
      startDate: '2026-08-27',
      endDate: '2026-08-29',
      startsAt: '2026-08-27T10:00:00+03:00',
    });

    expect(stay.checkIn).toBe('2026-08-26');
  });

  it('keeps the arrival on the day for an event opening exactly at noon', () => {
    const stay = computeStayDates({
      startDate: '2026-08-27',
      endDate: '2026-08-29',
      startsAt: '2026-08-27T12:00:00+03:00',
    });

    expect(stay.checkIn).toBe('2026-08-27');
  });

  it('pulls the arrival earlier for an event opening one minute before noon', () => {
    const stay = computeStayDates({
      startDate: '2026-08-27',
      endDate: '2026-08-29',
      startsAt: '2026-08-27T11:59:00+03:00',
    });

    expect(stay.checkIn).toBe('2026-08-26');
  });

  it('reads the opening hour in the offset the catalogue wrote, not in UTC', () => {
    // 11:00-03:00 is 14:00 UTC. Read as UTC the event would look like an afternoon opening
    // and the traveller would arrive on the day and miss a morning conference.
    const stay = computeStayDates({
      startDate: '2026-08-27',
      endDate: '2026-08-27',
      startsAt: '2026-08-27T11:00:00-03:00',
    });

    expect(stay.checkIn).toBe('2026-08-26');
  });

  it('does not slide to the previous day for an early opening in an eastern offset', () => {
    // 01:00+05:00 is 20:00 UTC on the previous calendar day.
    const stay = computeStayDates({
      startDate: '2026-08-27',
      endDate: '2026-08-27',
      startsAt: '2026-08-27T01:00:00+05:00',
    });

    expect(stay.checkIn).toBe('2026-08-26');
  });

  it('treats an unknown opening time cautiously and arrives the day before', () => {
    const stay = computeStayDates({ startDate: '2026-10-29', endDate: '2026-10-31' });

    expect(stay.checkIn).toBe('2026-10-28');
  });

  it('reports an unknown opening time instead of hiding it', () => {
    const stay = computeStayDates({ startDate: '2026-10-29', endDate: '2026-10-31' });

    expect(stay.openingTimeKnown).toBe(false);
  });

  it('adds a night when the catalogue gives no closing time', () => {
    const stay = computeStayDates({
      startDate: '2026-08-27',
      endDate: '2026-08-29',
      startsAt: '2026-08-27T10:00:00+03:00',
    });

    expect(stay.checkOut).toBe('2026-08-30');
  });

  it('adds a night for an event closing after six in the evening', () => {
    const stay = computeStayDates({
      startDate: '2026-08-27',
      endDate: '2026-08-27',
      startsAt: '2026-08-27T12:00:00+03:00',
      endsAt: '2026-08-27T18:01:00+03:00',
    });

    expect(stay.checkOut).toBe('2026-08-28');
  });

  it('leaves on the closing day for an event closing exactly at six', () => {
    const stay = computeStayDates({
      startDate: '2026-08-27',
      endDate: '2026-08-27',
      startsAt: '2026-08-27T12:00:00+03:00',
      endsAt: '2026-08-27T18:00:00+03:00',
    });

    expect(stay.checkOut).toBe('2026-08-27');
  });

  it('counts a stay that crosses the end of a month', () => {
    const stay = computeStayDates({ startDate: '2026-10-29', endDate: '2026-10-31' });

    expect(stay).toMatchObject({ checkIn: '2026-10-28', checkOut: '2026-11-01', nights: 4 });
  });

  it('counts a stay that crosses the end of a year', () => {
    const stay = computeStayDates({
      startDate: '2026-12-31',
      endDate: '2026-12-31',
      startsAt: '2026-12-31T10:00:00+03:00',
    });

    expect(stay).toMatchObject({ checkIn: '2026-12-30', checkOut: '2027-01-01', nights: 2 });
  });

  it('counts a stay across a leap day', () => {
    const stay = computeStayDates({
      startDate: '2028-02-29',
      endDate: '2028-02-29',
      startsAt: '2028-02-29T10:00:00+03:00',
    });

    expect(stay).toMatchObject({ checkIn: '2028-02-28', checkOut: '2028-03-01', nights: 2 });
  });

  it('allows zero nights for a same-day event that closes before the evening', () => {
    const stay = computeStayDates({
      startDate: '2026-08-27',
      endDate: '2026-08-27',
      startsAt: '2026-08-27T12:00:00+03:00',
      endsAt: '2026-08-27T17:00:00+03:00',
    });

    expect(stay.nights).toBe(0);
  });

  it('asks for no hotel when the stay is zero nights', () => {
    const stay = computeStayDates({
      startDate: '2026-08-27',
      endDate: '2026-08-27',
      startsAt: '2026-08-27T12:00:00+03:00',
      endsAt: '2026-08-27T17:00:00+03:00',
    });

    expect(stay.needsHotel).toBe(false);
  });

  it('books the outbound journey on the arrival day and the return on the departure day', () => {
    const stay = computeStayDates({
      startDate: '2026-08-27',
      endDate: '2026-08-29',
      startsAt: '2026-08-27T10:00:00+03:00',
    });

    expect(stay).toMatchObject({ outboundDate: '2026-08-26', returnDate: '2026-08-30' });
  });

  it('refuses an event that ends before it starts instead of reshaping it into a trip', () => {
    // Clamping would answer with a plausible same-day stay on 27 August, and the next layer
    // would book transport for an event that finished on the 20th.
    expect(() =>
      computeStayDates({
        startDate: '2026-08-27',
        endDate: '2026-08-20',
        startsAt: '2026-08-27T12:00:00+03:00',
      }),
    ).toThrow(/2026-08-27.*2026-08-20/);
  });

  it('asks for a hotel on any stay longer than a day', () => {
    const stay = computeStayDates({
      startDate: '2026-08-27',
      endDate: '2026-08-29',
      startsAt: '2026-08-27T10:00:00+03:00',
    });

    expect(stay).toMatchObject({ needsHotel: true, nights: 4 });
  });

  it('reports a known opening time as known', () => {
    const stay = computeStayDates({
      startDate: '2026-08-27',
      endDate: '2026-08-29',
      startsAt: '2026-08-27T10:00:00+03:00',
    });

    expect(stay.openingTimeKnown).toBe(true);
  });

  it('reports a known closing time as known', () => {
    const stay = computeStayDates({
      startDate: '2026-08-27',
      endDate: '2026-08-27',
      startsAt: '2026-08-27T12:00:00+03:00',
      endsAt: '2026-08-27T17:00:00+03:00',
    });

    expect(stay.closingTimeKnown).toBe(true);
  });

  it('reports a missing closing time as unknown', () => {
    const stay = computeStayDates({ startDate: '2026-08-27', endDate: '2026-08-29' });

    expect(stay.closingTimeKnown).toBe(false);
  });

  it('rejects a time with trailing rubbish rather than reading its prefix', () => {
    // A prefix match would read 12:00 here and report a known opening time for a string
    // nobody can actually interpret.
    const stay = computeStayDates({
      startDate: '2026-08-27',
      endDate: '2026-08-29',
      startsAt: '2026-08-27T12:00junk',
    });

    expect(stay).toMatchObject({ openingTimeKnown: false, checkIn: '2026-08-26' });
  });

  it('rejects a date inside the timestamp that could not exist', () => {
    const stay = computeStayDates({
      startDate: '2026-08-27',
      endDate: '2026-08-29',
      startsAt: '2026-99-99T10:00:00+03:00',
    });

    expect(stay.openingTimeKnown).toBe(false);
  });

  it('rejects an offset no place on earth uses', () => {
    const stay = computeStayDates({
      startDate: '2026-08-27',
      endDate: '2026-08-29',
      startsAt: '2026-08-27T10:00:00+99:99',
    });

    expect(stay.openingTimeKnown).toBe(false);
  });

  it('rejects an hour that does not exist', () => {
    const stay = computeStayDates({
      startDate: '2026-08-27',
      endDate: '2026-08-29',
      startsAt: '2026-08-27T25:00:00+03:00',
    });

    expect(stay.openingTimeKnown).toBe(false);
  });

  it('accepts a time without seconds, which is how some sources write it', () => {
    const stay = computeStayDates({
      startDate: '2026-08-27',
      endDate: '2026-08-29',
      startsAt: '2026-08-27T14:30+03:00',
    });

    expect(stay).toMatchObject({ openingTimeKnown: true, checkIn: '2026-08-27' });
  });

  it('refuses a date it cannot read rather than inventing one', () => {
    expect(() => computeStayDates({ startDate: '27.08.2026', endDate: '2026-08-29' })).toThrow(
      /27\.08\.2026/,
    );
  });

  it('refuses a date that does not exist', () => {
    expect(() => computeStayDates({ startDate: '2026-02-30', endDate: '2026-02-30' })).toThrow(
      /2026-02-30/,
    );
  });

  it('ignores an opening time it cannot read and says the time is unknown', () => {
    const stay = computeStayDates({
      startDate: '2026-08-27',
      endDate: '2026-08-29',
      startsAt: 'сегодня в десять',
    });

    expect(stay).toMatchObject({ openingTimeKnown: false, checkIn: '2026-08-26' });
  });

  it('answers the whole stay exactly, so a later change cannot slip through unnoticed', () => {
    const stay = computeStayDates({
      startDate: '2026-08-27',
      endDate: '2026-08-29',
      startsAt: '2026-08-27T10:00:00+03:00',
    });

    expect(stay).toEqual({
      checkIn: '2026-08-26',
      checkOut: '2026-08-30',
      outboundDate: '2026-08-26',
      returnDate: '2026-08-30',
      nights: 4,
      needsHotel: true,
      openingTimeKnown: true,
      closingTimeKnown: false,
    });
  });
});
