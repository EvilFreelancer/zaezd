/**
 * The shape of a `TripResult` as it reaches the browser.
 *
 * Written out here rather than imported from `src/composer/`, because the browser tree compiles
 * on its own and importing across that boundary would drag the server's module graph into the
 * page. It is a wire contract: what the server serialises and what the renderer reads.
 *
 * Kept deliberately narrow - only what the screen actually uses - so a change in the domain
 * that the screen does not care about does not ripple into it.
 */

export type Money = { readonly amount: number; readonly currency: string };

export type GeoPoint = { readonly lat: number; readonly lng: number };

export type VenueLocation =
  | ({ readonly precision: 'exact' } & GeoPoint)
  | ({ readonly precision: 'approximate' } & GeoPoint)
  | ({ readonly precision: 'city' } & GeoPoint)
  | { readonly precision: 'unknown' };

export type CatalogueEvent = {
  readonly id: number;
  readonly title: string;
  readonly url?: string;
  readonly startDate: string;
  readonly endDate: string;
  readonly startsAt?: string;
  readonly city?: string;
  readonly venue?: string;
  readonly isFree?: boolean;
};

export type Leg = {
  readonly offerId: string;
  readonly mode: string;
  readonly price: Money;
  readonly durationMin: number;
  readonly departureAt: string;
  readonly arrivalAt: string;
  readonly voyageNo?: string;
};

export type HotelOffer = {
  readonly id: string;
  readonly name: string;
  readonly address?: string;
  readonly location?: GeoPoint;
  readonly price: Money;
  readonly photo?: string;
};

export type RankedHotel = {
  readonly hotel: HotelOffer;
  readonly distanceM?: number;
};

export type Feasibility = {
  readonly makesTheOpening?: boolean;
  readonly marginMinutes?: number;
  readonly leavesAfterTheEnd?: boolean;
  readonly canBePrimary: boolean;
  readonly notes: readonly string[];
};

export type CostLine = {
  readonly part: string;
  readonly amount: number;
  readonly currency: string;
};

export type TripCost = {
  readonly total: number;
  readonly currency: string;
  readonly isLowerBound: boolean;
  readonly complete: boolean;
  readonly missing: readonly string[];
  readonly breakdown: readonly CostLine[];
  readonly eventPriceExcluded: boolean;
  readonly eventPriceText?: string;
  readonly budget?: {
    readonly limit: number;
    readonly remaining: number;
    readonly exceeded: boolean;
    readonly couldExceed: boolean;
  };
};

export type TripVariant = {
  readonly id: string;
  readonly outbound: Leg;
  readonly back: Leg;
  readonly hotel?: RankedHotel;
  readonly cost: TripCost;
  readonly feasibility: Feasibility;
  readonly totalDurationMin: number;
  readonly workingDaysBurnt?: number;
};

export type TripPackage = {
  readonly rules: readonly string[];
  readonly variant: TripVariant;
};

export type EventCard = {
  readonly event: CatalogueEvent;
  readonly venueLocation: VenueLocation;
  readonly walkingMinutes?: number;
};

export type CoverageNote = {
  readonly citiesListed: number;
  readonly citiesWithEvents?: number;
  readonly busiestCities: readonly { readonly title: string; readonly upcomingEvents: number }[];
  readonly onlineEvents: number;
  readonly countsCoverWholeDirectory: boolean;
};

export type SkippedNote = {
  readonly reason: string;
  readonly events: readonly { readonly id: number; readonly title: string; readonly url?: string }[];
};

export type DayForecast = {
  readonly date: string;
  readonly maxC: number;
  readonly minC: number;
  readonly rainChance?: number;
};

export type TripRequest = {
  readonly topics: readonly string[];
  readonly origin: string;
  readonly adults: number;
  readonly budget?: number;
  readonly dateFrom?: string;
  readonly dateTo?: string;
};

export type TripResult = {
  readonly request: TripRequest;
  readonly event?: EventCard;
  readonly stay?: {
    readonly checkIn: string;
    readonly checkOut: string;
    readonly nights: number;
    readonly needsHotel: boolean;
  };
  readonly packages: readonly TripPackage[];
  readonly alternatives: readonly CatalogueEvent[];
  readonly noTravelNeeded: readonly SkippedNote[];
  readonly coverage: CoverageNote;
  readonly notes: readonly string[];
  readonly sourceNotes: readonly {
    readonly source: string;
    readonly what: string;
    readonly reason: string;
  }[];
  readonly emptyReason?: string;
  readonly workingDaysCounted: boolean;
  readonly forecast?: readonly DayForecast[];
  readonly computedAt: string;
  readonly mode: 'live' | 'replay';
};

export type CheckoutLink = {
  readonly part: string;
  readonly url: string;
  readonly kind?: string;
  readonly label: string;
  readonly opensACart: boolean;
  readonly caveat?: string;
  readonly recorded?: boolean;
};
