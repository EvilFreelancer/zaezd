/**
 * Steps that put a recorded catalogue on the World.
 *
 * They live in their own file because more than one feature starts from "the catalogue said
 * this", and `strict: true` makes a duplicated step a hard error rather than a coin toss.
 */
import { Given } from '@cucumber/cucumber';
import type { CatalogueEvent } from '../../src/composer/types.ts';
import { loadPayload } from '../support/fixtures.ts';
import type { ZaezdWorld } from '../support/world.ts';

type RecordedEvent = {
  readonly id: number;
  readonly title: string;
  readonly start_date: string;
  readonly end_date: string;
  readonly starts_at: string | null;
  readonly city: string | null;
  readonly city_slug: string | null;
  readonly venue: string | null;
  readonly format: string;
  readonly is_free: boolean | null;
  readonly price: string | null;
  readonly topics: readonly string[];
};

/**
 * Field renaming only. Turning a recorded payload into a domain type is the job of
 * `src/sources/normalize.ts`; until that exists the step renames and nothing else, and these
 * scenarios will be rewired through the real normalizer when it lands.
 */
function asEvent(recorded: RecordedEvent): CatalogueEvent {
  const format =
    recorded.format === 'online' || recorded.format === 'hybrid' ? recorded.format : 'offline';
  return {
    id: recorded.id,
    title: recorded.title,
    startDate: recorded.start_date,
    endDate: recorded.end_date,
    format,
    topics: recorded.topics,
    ...(recorded.starts_at === null ? {} : { startsAt: recorded.starts_at }),
    ...(recorded.city === null ? {} : { city: recorded.city }),
    ...(recorded.city_slug === null ? {} : { citySlug: recorded.city_slug }),
    ...(recorded.venue === null ? {} : { venue: recorded.venue }),
    ...(recorded.is_free === null ? {} : { isFree: recorded.is_free }),
    ...(recorded.price === null ? {} : { price: recorded.price }),
  };
}

function load(world: ZaezdWorld, fixture: string): void {
  const { items } = loadPayload<{ items: RecordedEvent[] }>(fixture);
  world.remember('events', items.map(asEvent));
}

Given(
  'the recorded catalogue of offline events on artificial intelligence',
  function (this: ZaezdWorld) {
    load(this, 'confcal/events-ai-offline.json');
  },
);

Given(
  'the recorded catalogue of online events on artificial intelligence',
  function (this: ZaezdWorld) {
    load(this, 'confcal/events-ai-online.json');
  },
);

Given(
  'the recorded catalogue of offline events in the traveller own city',
  function (this: ZaezdWorld) {
    load(this, 'confcal/events-ai-moscow.json');
  },
);

Given('the recorded catalogue has no offline events on this topic', function (this: ZaezdWorld) {
  load(this, 'confcal/events-empty.json');
});
