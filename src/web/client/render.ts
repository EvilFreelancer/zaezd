/**
 * The trip board.
 *
 * One renderer, two channels: the web page hands it a `TripResult` embedded by the server, an
 * MCP App hands it the same object arriving from the host. It does no arithmetic - every number
 * on the screen was computed by the deterministic core and is printed exactly as it arrived,
 * because rounding a price here would make the card disagree with the sum under it.
 */

import type { TripResult } from './types.ts';
import type {
  CheckoutLink,
  Money,
  TripPackage,
  TripVariant,
  Leg,
  RankedHotel,
  Feasibility,
  TripCost,
} from './types.ts';
import {
  coverageSentence,
  plural,
  sourceNoteText,
  EMPTY_REASONS,
  MODE_NAMES,
  NOTE_TEXTS,
  RULE_NAMES,
} from './copy.ts';

const MONEY_SUFFIX: Readonly<Record<string, string>> = { RUB: '₽' };

/** Exactly as the payload wrote it. Tutu's own instructions ask for no rounding. */
function money(value: Money | undefined): string {
  if (value === undefined || value === null) return '';
  const suffix = MONEY_SUFFIX[value.currency] ?? value.currency;
  const digits = Number.isInteger(value.amount)
    ? String(value.amount)
    : value.amount.toFixed(2).replace(/\.?0+$/, '');
  return `${digits.replace(/\B(?=(\d{3})+(?!\d))/g, ' ')} ${suffix}`;
}

function hours(minutes: number | undefined): string {
  if (minutes === undefined) return '';
  const sign = minutes < 0 ? '-' : '';
  const total = Math.abs(minutes);
  const h = Math.floor(total / 60);
  const m = total % 60;
  return h === 0 ? `${sign}${m} мин` : `${sign}${h} ч ${String(m).padStart(2, '0')} мин`;
}

const MONTHS = [
  'января', 'февраля', 'марта', 'апреля', 'мая', 'июня',
  'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря',
];

function day(iso: string | undefined): string {
  if (typeof iso !== 'string') return '';
  const [, month, date] = iso.slice(0, 10).split('-');
  return `${Number(date)} ${MONTHS[Number(month) - 1] ?? ''}`;
}

function clock(iso: string | undefined): string {
  return typeof iso === 'string' ? iso.slice(11, 16) : '';
}

type Attrs = Readonly<Record<string, string | number | boolean | undefined>>;
type Child = Node | string | undefined;

function el(tag: string, attrs: Attrs = {}, children: Child | readonly Child[] = []): HTMLElement {
  const node = document.createElement(tag);
  for (const [name, value] of Object.entries(attrs)) {
    if (value === undefined || value === false) continue;
    if (name === 'class') node.className = String(value);
    else if (name === 'text') node.textContent = String(value);
    else node.setAttribute(name, value === true ? '' : String(value));
  }
  for (const child of ([children] as Child[][]).flat()) {
    if (child === undefined) continue;
    node.append(child);
  }
  return node;
}

function legLine(leg: Leg, feasibility: Feasibility, which: 'there' | 'back'): HTMLElement {
  const mode = MODE_NAMES[leg.mode] ?? leg.mode;
  const number = leg.voyageNo === undefined ? '' : ` ${leg.voyageNo}`;
  const margin =
    which === 'there' && feasibility.marginMinutes !== undefined
      ? el('span', {
          class: `leg__margin${feasibility.makesTheOpening === false ? ' leg__margin--late' : ''}`,
          text:
            feasibility.marginMinutes >= 0
              ? `запас ${hours(feasibility.marginMinutes)}`
              : `опоздание ${hours(-feasibility.marginMinutes)}`,
        })
      : undefined;

  return el('div', { class: 'leg' }, [
    el('span', { class: 'leg__what', text: `${which === 'there' ? 'Туда' : 'Обратно'}: ${mode}${number}` }),
    el('span', {
      class: 'leg__when',
      text: `${day(leg.departureAt)}, ${clock(leg.departureAt)} → ${clock(leg.arrivalAt)}`,
    }),
    el('span', { class: 'leg__price', text: money(leg.price) }),
    margin,
  ]);
}

function hotelLine(entry: RankedHotel | undefined): HTMLElement {
  if (entry === undefined) return el('div', { class: 'leg leg--absent', text: 'Без отеля' });

  const distance =
    entry.distanceM === undefined
      ? undefined
      : el('span', { class: 'leg__margin', text: `${(entry.distanceM / 1000).toFixed(1)} км до площадки` });

  return el('div', { class: 'leg leg--hotel' }, [
    photo(entry.hotel.photo, entry.hotel.name),
    el('span', { class: 'leg__what', text: `Отель: ${entry.hotel.name}` }),
    el('span', { class: 'leg__when', text: entry.hotel.address ?? 'адрес Туту не вернул' }),
    el('span', { class: 'leg__price', text: money(entry.hotel.price) }),
    distance,
  ]);
}

/**
 * The hotel's own picture, when Tutu gave one and the policy lets it through.
 *
 * A broken image is worse than none, so an image that fails to load removes itself instead of
 * leaving a torn frame in the card.
 */
function photo(url: string | undefined, name: string): HTMLElement | undefined {
  if (url === undefined) return undefined;

  const image = el('img', { class: 'leg__photo', src: url, alt: name, loading: 'lazy' });
  image.addEventListener('error', () => image.remove());
  return image;
}

const PART_NAMES: Readonly<Record<string, string>> = { outbound: 'дорога туда', hotel: 'отель', back: 'обратно', event: 'событие' };

function budgetBar(cost: TripCost): HTMLElement {
  const total = cost.total || 1;
  const segments = cost.breakdown.map((line) =>
    el('span', {
      class: `bar__part bar__part--${line.part}`,
      style: `width:${Math.max(2, (line.amount / total) * 100)}%`,
      title: `${PART_NAMES[line.part] ?? line.part}: ${money(line)}`,
    }),
  );

  const sum = cost.breakdown
    .map((line) => `${PART_NAMES[line.part] ?? line.part} ${money(line)}`)
    .join(' + ');
  const totalText = money({ amount: cost.total, currency: cost.currency });
  const left =
    cost.budget === undefined
      ? ''
      : cost.budget.remaining >= 0
        ? `, остаток ${money({ amount: cost.budget.remaining, currency: cost.currency })}`
        : `, превышение ${money({ amount: -cost.budget.remaining, currency: cost.currency })}`;

  return el('div', { class: 'budget' }, [
    el('div', { class: 'bar' }, segments),
    el('p', { class: 'budget__sum', text: `${sum} = ${totalText}${left}` }),
  ]);
}

function packageCard(
  item: TripPackage,
  index: number,
  onSelect: (variantId: string) => void,
): HTMLElement {
  const { variant, rules } = item;
  const late = variant.feasibility.canBePrimary === false;

  const card = el(
    'article',
    {
      class: `card${late ? ' card--late' : ''}`,
      tabindex: 0,
      role: 'button',
      'aria-pressed': index === 0 ? 'true' : 'false',
      'data-variant': variant.id,
    },
    [
      el('header', { class: 'card__head' }, [
        el('h3', { class: 'card__rule', text: rules.map((rule) => RULE_NAMES[rule] ?? rule).join(' · ') }),
        el('p', {
          class: 'card__total',
          text: `${variant.cost.isLowerBound ? 'от ' : ''}${money({ amount: variant.cost.total, currency: variant.cost.currency })}`,
        }),
      ]),
      late
        ? el('p', { class: 'card__flag', text: 'Прибытие позже открытия, основным вариантом быть не может' })
        : undefined,
      variant.cost.complete === false
        ? el('p', {
            class: 'card__flag card__flag--soft',
            text: `Не полная цена участия: не хватает ${variant.cost.missing.map((part) => PART_NAMES[part] ?? part).join(', ')}`,
          })
        : undefined,
      legLine(variant.outbound, variant.feasibility, 'there'),
      hotelLine(variant.hotel),
      legLine(variant.back, variant.feasibility, 'back'),
      variant.workingDaysBurnt === undefined
        ? undefined
        : el('p', {
            class: 'card__days',
            text: `Сгорает ${variant.workingDaysBurnt} ${plural(
              variant.workingDaysBurnt,
              'рабочий день',
              'рабочих дня',
              'рабочих дней',
            )}`,
          }),
      budgetBar(variant.cost),
      el('button', { class: 'card__checkout', type: 'button', 'data-variant': variant.id, text: 'Собрать ссылки на оплату' }),
    ],
  );

  card.addEventListener('click', () => onSelect(variant.id));
  card.addEventListener('keydown', (event) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      onSelect(variant.id);
    }
  });
  return card;
}

function eventHeader(trip: TripResult, card: NonNullable<TripResult['event']>): HTMLElement {
  const event = card.event;
  const dates =
    trip.stay === undefined ? '' : `${day(trip.stay.checkIn)} - ${day(trip.stay.checkOut)}`;
  const nights =
    trip.stay === undefined
      ? ''
      : `${trip.stay.nights} ${plural(trip.stay.nights, 'ночь', 'ночи', 'ночей')}`;

  const facts = [event.city, dates, nights, event.isFree === true ? 'бесплатно' : undefined]
    .filter((fact) => fact !== undefined && fact !== '')
    .join(' · ');

  const venue =
    card.venueLocation.precision === 'exact'
      ? event.venue
      : card.venueLocation.precision === 'city'
        ? 'точный адрес каталог не отдал, показан центр города'
        : 'адрес площадки неизвестен';

  return el('header', { class: 'event' }, [
    el('h1', { class: 'event__title' }, [
      event.url === undefined
        ? document.createTextNode(event.title)
        : el('a', { class: 'event__link', href: event.url, target: '_blank', rel: 'noopener', text: event.title }),
    ]),
    el('p', { class: 'event__facts', text: facts }),
    el('p', { class: 'event__venue', text: venue ?? 'площадку каталог не назвал' }),
    card.walkingMinutes === undefined
      ? undefined
      : el('p', { class: 'event__walk', text: `${card.walkingMinutes} мин пешком от ближайшего отеля` }),
    card.event.startsAt === undefined
      ? el('p', { class: 'event__note', text: 'Время начала каталог не отдал, проверка запаса ослаблена' })
      : undefined,
  ]);
}

function timeline(trip: TripResult): HTMLElement | undefined {
  const first = trip.packages[0];
  if (first === undefined || trip.event === undefined) return undefined;

  const marks = [
    { at: first.variant.outbound.departureAt, what: 'выезд' },
    { at: first.variant.outbound.arrivalAt, what: 'прибытие' },
    { at: trip.event.event.startsAt, what: 'начало' },
    { at: first.variant.back.departureAt, what: 'выезд обратно' },
    { at: first.variant.back.arrivalAt, what: 'дома' },
  ].filter((mark): mark is { at: string; what: string } => typeof mark.at === 'string');

  const times = marks.map((mark) => Date.parse(mark.at));
  const from = Math.min(...times);
  const span = Math.max(...times) - from || 1;

  return el('section', { class: 'timeline', 'aria-label': 'Таймлайн поездки' }, [
    el('div', { class: 'timeline__rail' },
      marks.map((mark, index) =>
        el('span', {
          class: 'timeline__mark',
          style: `left:${(((times[index] as number) - from) / span) * 100}%`,
          'data-what': mark.what,
          title: `${mark.what}, ${day(mark.at)} ${clock(mark.at)}`,
        }),
      ),
    ),
    el('p', { class: 'timeline__legend', text: marks.map((mark) => `${mark.what} ${clock(mark.at)}`).join(' · ') }),
  ]);
}

function coverageNote(trip: TripResult): HTMLElement {
  return el('p', { class: 'coverage', text: coverageSentence(trip.coverage) });
}

/**
 * The shortlist, in words.
 *
 * It carries what the map carries - which hotel, how far, how much - so a refused tile server
 * costs the picture and nothing else. It is also the only way to read the shortlist on a phone
 * held in one hand.
 */
function hotelList(trip: TripResult, onSelect: (variantId: string) => void): HTMLElement | undefined {
  const seen = new Set<string>();
  const rows: HTMLElement[] = [];

  for (const item of trip.packages) {
    const ranked = item.variant.hotel;
    if (ranked === undefined || seen.has(ranked.hotel.id)) continue;
    seen.add(ranked.hotel.id);

    const distance =
      ranked.distanceM === undefined
        ? 'расстояние не посчитано'
        : `${(ranked.distanceM / 1000).toFixed(1)} км до площадки`;

    const row = el('li', { class: 'hotels__item' }, [
      el('button', { class: 'hotels__pick', type: 'button', 'data-variant': item.variant.id }, [
        el('span', { class: 'hotels__name', text: ranked.hotel.name }),
        el('span', { class: 'hotels__where', text: distance }),
        el('span', { class: 'hotels__price', text: money(ranked.hotel.price) }),
      ]),
    ]);
    row.addEventListener('click', () => onSelect(item.variant.id));
    rows.push(row);
  }

  if (rows.length === 0) return undefined;
  return el('section', { class: 'hotels', 'aria-label': 'Отели рядом с площадкой' }, [
    el('h2', { class: 'hotels__title', text: 'Где спать' }),
    el('ul', { class: 'hotels__list' }, rows),
  ]);
}

function alternativesList(trip: TripResult): HTMLElement | undefined {
  if (trip.alternatives.length === 0) return undefined;

  return el('section', { class: 'others' }, [
    el('h2', { class: 'others__title', text: 'Ещё события по теме' }),
    el('ul', { class: 'others__list' },
      trip.alternatives.map((event) =>
        el('li', { class: 'others__item' }, [
          event.url === undefined
            ? document.createTextNode(event.title)
            : el('a', { href: event.url, target: '_blank', rel: 'noopener', text: event.title }),
          el('span', { class: 'others__where', text: ` — ${event.city ?? ''}, ${day(event.startDate)}` }),
        ]),
      ),
    ),
  ]);
}

const SKIP_TEXTS: Readonly<Record<string, string>> = {
  online: 'проходят онлайн, ехать никуда не надо',
  'origin-city': 'уже в вашем городе',
  'no-destination': 'каталог не назвал город',
  unreachable: 'до них уже не успеть',
  'outside-window': 'выходят за выбранные даты',
  unreadable: 'записи каталога противоречат сами себе',
  'over-the-cap': 'не поместились в короткий список',
};

function skippedList(trip: TripResult): HTMLElement | undefined {
  if (trip.noTravelNeeded.length === 0) return undefined;

  return el('section', { class: 'skipped' }, [
    el('h2', { class: 'skipped__title', text: 'Что не вошло' }),
    el('ul', { class: 'skipped__list' },
      trip.noTravelNeeded.map((note) =>
        el('li', {
          class: 'skipped__item',
          text: `${note.events.length} ${plural(note.events.length, 'событие', 'события', 'событий')} — ${
            SKIP_TEXTS[note.reason] ?? note.reason
          }`,
        }),
      ),
    ),
  ]);
}

function notices(trip: TripResult): HTMLElement | undefined {
  const items = [
    ...trip.notes.map((note) => NOTE_TEXTS[note]).filter(Boolean),
    ...trip.sourceNotes.map(sourceNoteText),
    trip.forecast === undefined && trip.event !== undefined
      ? 'Прогноз погоды на эти даты недоступен, окно прогноза 16 дней.'
      : undefined,
    trip.mode === 'replay' ? `Экран собран из записи от ${day(trip.computedAt)}.` : undefined,
  ].filter(Boolean);

  if (items.length === 0) return undefined;
  return el('section', { class: 'notices' },
    items.map((text) => el('p', { class: 'notices__item', text })),
  );
}

function forecastBlock(trip: TripResult): HTMLElement | undefined {
  if (trip.forecast === undefined) return undefined;

  return el('section', { class: 'weather' }, [
    el('h2', { class: 'weather__title', text: 'Погода' }),
    el('ul', { class: 'weather__list' },
      trip.forecast.map((entry) =>
        el('li', {
          class: 'weather__day',
          text: `${day(entry.date)}: ${Math.round(entry.minC)}…${Math.round(entry.maxC)} °C${
            entry.rainChance === undefined ? '' : `, осадки ${entry.rainChance}%`
          }`,
        }),
      ),
    ),
  ]);
}

export type RenderHandlers = { readonly onSelect?: (variantId: string) => void };

export function renderTrip(
  root: HTMLElement,
  trip: TripResult,
  handlers: RenderHandlers = {},
): void {
  root.replaceChildren();

  if (trip.event === undefined) {
    root.append(
      el('section', { class: 'empty' }, [
        el('h1', { class: 'empty__title', text: 'Поездку собрать не из чего' }),
        el('p', {
          class: 'empty__why',
          text: EMPTY_REASONS[trip.emptyReason ?? 'nothing-left'] ?? 'Причина неизвестна.',
        }),
        coverageNote(trip),
        skippedList(trip),
      ]),
    );
    return;
  }

  const onSelect = handlers.onSelect ?? (() => {});
  const cards = el('section', { class: 'cards', 'aria-label': 'Варианты поездки' },
    trip.packages.map((item, index) => packageCard(item, index, onSelect)),
  );

  const blocks: (Node | undefined)[] = [
    eventHeader(trip, trip.event),
    el('div', { class: 'board__body' }, [
      el('div', { class: 'board__left' }, [cards, timeline(trip)]),
      el('div', { class: 'board__right' }, [
        el('div', { class: 'map', id: 'map', 'aria-label': 'Карта города события' }),
        hotelList(trip, onSelect),
        forecastBlock(trip),
      ]),
    ]),
    notices(trip),
    alternativesList(trip),
    skippedList(trip),
    coverageNote(trip),
  ];
  root.append(...blocks.filter((block): block is Node => block !== undefined));
}

export { day, clock, hours, money };
export type { CheckoutLink, TripVariant };
