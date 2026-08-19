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

  it('never produces a negative stay when the catalogue ends an event before it starts', () => {
    const stay = computeStayDates({
      startDate: '2026-08-27',
      endDate: '2026-08-20',
      startsAt: '2026-08-27T12:00:00+03:00',
      endsAt: '2026-08-20T17:00:00+03:00',
    });

    expect(stay).toMatchObject({ checkIn: '2026-08-27', checkOut: '2026-08-27', nights: 0 });
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

  it('answers identically every time it is asked', () => {
    const schedule = {
      startDate: '2026-08-27',
      endDate: '2026-08-29',
      startsAt: '2026-08-27T10:00:00+03:00',
    };

    expect(computeStayDates(schedule)).toEqual(computeStayDates(schedule));
  });
});
