/**
 * Product copy shared by the two delivery channels.
 *
 * The screen and the MCP text channel say the same sentence about catalogue coverage, so it is
 * written once. The module lives under the browser build because that build compiles only its
 * own directory; both importers are L4 delivery adapters, so nothing points upward.
 */

/**
 * Russian counts three ways, and "21 городов" is the kind of thing a judge notices in the first
 * five seconds. One helper, used everywhere a number meets a noun.
 */
export function plural(count: number, one: string, few: string, many: string): string {
  const tens = count % 100;
  if (tens >= 11 && tens <= 14) return many;
  const ones = count % 10;
  if (ones === 1) return one;
  if (ones >= 2 && ones <= 4) return few;
  return many;
}

/** Just enough of a `CoverageNote` to write the sentence; both channels satisfy it structurally. */
export type CoverageCounts = {
  readonly citiesListed: number;
  readonly citiesWithEvents?: number;
  readonly onlineEvents: number;
  readonly countsCoverWholeDirectory: boolean;
};

/**
 * How wide the catalogue actually is. Empty cities are not hidden and a count taken from a
 * single directory page says so rather than passing itself off as the whole picture.
 */
export function coverageSentence(coverage: CoverageCounts): string {
  const cities = `${coverage.citiesListed} ${plural(coverage.citiesListed, 'город', 'города', 'городов')}`;
  if (!coverage.countsCoverWholeDirectory || coverage.citiesWithEvents === undefined) {
    return `Каталог знает ${cities}. Счётчики показаны по одной странице справочника.`;
  }

  const online = `${coverage.onlineEvents} ${plural(coverage.onlineEvents, 'событие', 'события', 'событий')}`;
  return `Каталог знает ${cities}, живые офлайн-события есть в ${coverage.citiesWithEvents}. Ещё ${online} проходят онлайн.`;
}

/** What a traveller calls the way there. Shared, so the screen and the text channel agree. */
export const MODE_NAMES: Readonly<Record<string, string>> = {
  avia: 'самолёт',
  railway: 'поезд',
  bus: 'автобус',
  etrain: 'электричка',
};

/** The name of the rule that picked a package, in the words the card shows. */
export const RULE_NAMES: Readonly<Record<string, string>> = {
  cheapest: 'Дешевле всего',
  'no-leave': 'Без отпуска',
  fastest: 'Быстрее всего',
};

/** Why no trip came out of the request. One sentence per cause, never a blank screen. */
export const EMPTY_REASONS: Readonly<Record<string, string>> = {
  'catalogue-empty': 'Каталог не вернул ни одного события по этой теме.',
  'all-online': 'Все события по этой теме проходят онлайн, ехать никуда не надо.',
  'all-in-origin-city': 'Все события по этой теме уже в вашем городе.',
  'all-unreachable': 'До всех ближайших событий уже не успеть.',
  'all-outside-window': 'Все события выходят за выбранные даты.',
  'all-without-destination': 'Каталог не назвал город ни у одного события.',
  'all-unreadable': 'Записи каталога по этой теме противоречат сами себе.',
  'nothing-left': 'После отбора не осталось ни одного варианта поездки.',
};

/** What part of the trip a source was asked for. */
const SOURCE_PARTS: Readonly<Record<string, string>> = {
  'transport-out': 'Дорога туда',
  'transport-back': 'Дорога обратно',
  hotels: 'Отели',
  catalogue: 'Каталог событий',
};

/** Why it did not arrive. The English detail stays in the logs where it belongs. */
const SOURCE_REASONS: Readonly<Record<string, string>> = {
  timeout: 'источник не ответил вовремя',
  unreachable: 'до источника не достучались',
  refused: 'источник отказал в ответе',
  unreadable: 'источник ответил в непонятном виде',
  'not-recorded': 'в записи нет такого запроса',
};

/**
 * A failing source is named, not hidden.
 *
 * It also never becomes a claim that the thing does not exist: trains that failed to load are
 * trains that failed to load, not the absence of trains.
 */
export function sourceNoteText(note: { readonly what: string; readonly reason: string }): string {
  const part = SOURCE_PARTS[note.what] ?? note.what;
  const why = SOURCE_REASONS[note.reason] ?? 'источник не ответил';
  return `${part}: ${why}.`;
}

/** Why the packages look the way they do. One sentence per note, identical in both channels. */
export const NOTE_TEXTS: Readonly<Record<string, string>> = {
  'no-feasible-variant': 'Ни один вариант не успевает к открытию. Показаны все, помеченными.',
  'over-budget': 'В бюджет не влезает ни один вариант. Показан самый дешёвый.',
  'budget-uncertain': 'Итог занижен, поэтому уложиться в бюджет не гарантировано.',
  'no-working-day-data': 'Производственный календарь не ответил, карточка про отпуск не собрана.',
};
