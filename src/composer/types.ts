/**
 * The vocabulary the whole product shares. It grows one feature at a time; publishing the
 * full domain in the first commit would mean a type nobody has exercised yet.
 */

/** A calendar day, `YYYY-MM-DD`. Never a `Date`: a day has no time zone and no clock. */
export type IsoDate = string;

/**
 * A moment written the way a source wrote it, ISO 8601 with an offset
 * (`2026-08-27T10:00:00+03:00`). The offset is part of the value and is never normalised
 * away, because "does the event open before noon" is a question about the local wall clock
 * and "does the traveller arrive in time" is a question about the instant.
 */
export type IsoDateTime = string;

/** An amount exactly as a source returned it. Rendered without rounding, all the way out. */
export type Money = {
  readonly amount: number;
  readonly currency: string;
};

/** What a source calls a place, after L3 has resolved the traveller's free-text origin. */
export type ResolvedCity = {
  readonly slug: string;
  readonly title: string;
};

export type EventFormat = 'offline' | 'online' | 'hybrid';

/**
 * One event from the catalogue, after normalization. A field the catalogue did not return
 * stays `undefined` all the way to the screen and is rendered as missing, never guessed.
 */
export type CatalogueEvent = {
  readonly id: number;
  readonly title: string;
  readonly url?: string;
  readonly startDate: IsoDate;
  readonly endDate: IsoDate;
  readonly startsAt?: IsoDateTime;
  /** confcal never supplies this. It exists for a source that might. */
  readonly endsAt?: IsoDateTime;
  readonly city?: string;
  readonly citySlug?: string;
  /** Free text: "РУДН, Москва", "YADRO", or nothing at all. Never coordinates. */
  readonly venue?: string;
  readonly format: EventFormat;
  readonly isFree?: boolean;
  /** Free text too: "от 7 000 ₽", "бесплатно", "уточняется у организатора". */
  readonly price?: string;
  readonly topics: readonly string[];
};

/** A pointer back to an event the traveller was not offered, enough to show and link it. */
export type EventRef = {
  readonly id: number;
  readonly title: string;
  readonly url?: string;
};

export type SkipReason =
  /** The event happens online; there is nothing to travel to. */
  | 'online'
  /** The event is in the city the traveller is already in. */
  | 'origin-city'
  /** Offline, but the catalogue named no city, so there is nowhere to send anyone. */
  | 'no-destination'
  /** The arrival day is already in the past. */
  | 'unreachable'
  /** Outside the dates the traveller asked for. */
  | 'outside-window'
  /** Fine, but past the cap on how many events are offered at once. */
  | 'over-the-cap'
  /** The catalogue record contradicts itself and cannot be read. */
  | 'unreadable';

export type SkippedNote = {
  readonly reason: SkipReason;
  readonly events: readonly EventRef[];
};

/** One city of the catalogue directory with its count of upcoming events. */
export type CityCount = {
  readonly slug: string;
  readonly title: string;
  readonly upcomingEvents: number;
};

export type CityDirectory = {
  /** How many cities the directory holds in total, which a single page may not show. */
  readonly citiesTotal: number;
  /** Upcoming events with no city to travel to. */
  readonly onlineEvents: number;
  readonly cities: readonly CityCount[];
};

/**
 * What the catalogue can honestly claim about itself. Empty cities are not hidden: live
 * offline events exist in a handful of cities and saying otherwise is the easiest lie to tell.
 */
export type CoverageNote = {
  readonly citiesListed: number;
  /** Absent when only one page of the directory was seen; a page cannot count the whole. */
  readonly citiesWithEvents?: number;
  readonly busiestCities: readonly CityCount[];
  readonly onlineEvents: number;
  readonly countsCoverWholeDirectory: boolean;
};

/** A point on the map, as a source gave it. */
export type GeoPoint = {
  readonly lat: number;
  readonly lng: number;
};

/**
 * Where the event actually is, and how sure anyone is about it.
 *
 * The distinction is the product's, not the geocoder's. `city` means the geocoder answered but
 * only with a city centre, which is a normal outcome for venue strings like "YADRO", and it is
 * emphatically not a venue: no marker is drawn and no distance is claimed from it.
 */
export type VenueLocation =
  | ({ readonly precision: 'exact' } & GeoPoint)
  | ({ readonly precision: 'city' } & GeoPoint)
  | { readonly precision: 'unknown' };

/** One hotel from a Tutu listing, after normalization. */
export type HotelOffer = {
  readonly id: string;
  readonly name: string;
  readonly stars?: number;
  readonly rating?: number;
  readonly reviewCount?: number;
  /** Tutu writes this as prose, usually "N м от центра". Shown as written, never parsed. */
  readonly address?: string;
  readonly location?: GeoPoint;
  /** `price_basis: "stay_total"`. The whole stay, never per night. */
  readonly price: Money;
  readonly photo?: string;
  readonly alias?: string;
  /** Tutu's own handle on this listing row, carried verbatim and never rebuilt from parts. */
  readonly checkoutRef?: Readonly<Record<string, unknown>>;
};

export type TransportMode = 'avia' | 'railway' | 'bus' | 'etrain';

/**
 * One journey, in one direction, as Tutu offered it.
 *
 * `checkoutRef` is carried verbatim and never inspected here. It is Tutu's own handle on the
 * offer, its shape differs per mode, and rebuilding it from parts is how a checkout link ends
 * up pointing at the wrong train.
 */
export type Leg = {
  readonly offerId: string;
  readonly mode: TransportMode;
  readonly price: Money;
  readonly durationMin: number;
  readonly departureAt: IsoDateTime;
  readonly arrivalAt: IsoDateTime;
  readonly carriers: readonly string[];
  /** Train or flight number, when the mode has one. */
  readonly voyageNo?: string;
  /** Station or airport names, as Tutu wrote them. They are not accepted as search input. */
  readonly from?: string;
  readonly to?: string;
  readonly searchResultsUrl?: string;
  readonly checkoutRef?: Readonly<Record<string, unknown>>;
};

/** Why a whole transport mode is missing from a search. Never the same as "no offers". */
export type ModeFailure = {
  readonly mode: TransportMode;
  readonly reason: string;
  readonly detail?: string;
};

/**
 * A transport search, with the difference between "nothing on this page" and "this mode did
 * not answer" preserved. `search_multitransport` fails softly per mode, and an empty array is
 * not proof that a mode does not exist.
 */
export type TransportSearch = {
  readonly legs: readonly Leg[];
  readonly modesRequested: readonly TransportMode[];
  /** Modes that returned at least one offer somewhere, even beyond the page we were given. */
  readonly modesWithOffers: readonly TransportMode[];
  readonly modesUnavailable: readonly ModeFailure[];
  /** What Tutu decided the origin and destination were. Named back to the traveller. */
  readonly resolvedFrom?: string;
  readonly resolvedTo?: string;
};

/** A hotel listing, with the geography Tutu resolved and the identifiers it minted. */
export type HotelSearch = {
  readonly hotels: readonly HotelOffer[];
  readonly resolvedGeoName?: string;
  readonly resolvedGeoType?: string;
  /** Other geographies sharing the name, so a homonym can be named rather than hidden. */
  readonly alsoNamed: readonly string[];
  /** Expires quickly. Never cached, never stored in a snapshot. */
  readonly searchId?: string;
  readonly totalReturned: number;
  readonly hasMore: boolean;
};

/** What the traveller asked for, after the gateway normalised it. */
export type TripRequest = {
  readonly topics: readonly string[];
  /** As typed. L3 resolves it against the catalogue directory before the core sees it. */
  readonly origin: string;
  readonly budget?: number;
  readonly dateFrom?: IsoDate;
  readonly dateTo?: IsoDate;
  readonly adults: number;
};

/** The event as the screen shows it: the catalogue record plus what was learned about it. */
export type EventCard = {
  readonly event: CatalogueEvent;
  readonly venueLocation: VenueLocation;
  /** Minutes on foot from the chosen hotel. Absent unless a foot route was really computed. */
  readonly walkingMinutes?: number;
};

/** One line of the checkout checklist, with the wording derived from Tutu's own answer. */
export type CheckoutLink = {
  readonly part: 'outbound' | 'back' | 'hotel';
  readonly url: string;
  /** What Tutu called it. The label is derived from this and never assigned in advance. */
  readonly kind?: string;
  readonly label: string;
  readonly opensACart: boolean;
  readonly caveat?: string;
  /** True when the link came from a recording and has most likely expired. */
  readonly recorded?: boolean;
};
