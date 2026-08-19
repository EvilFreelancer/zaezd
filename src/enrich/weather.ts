/**
 * The forecast, when there is one, and silence when there is not.
 *
 * Open-Meteo forecasts sixteen days ahead. For a conference in late October asked about in
 * August there is no forecast, and there is no honest substitute either: historical averages
 * presented as a forecast are a made-up number with a plausible shape. So the block is either
 * real or absent.
 *
 * The source says so itself rather than returning an empty forecast - asked for a range beyond
 * the window it refuses and names its bounds, which is what the recorded fixture shows.
 */
import { TTL, cacheKey, type TtlCache } from '../sources/cache.ts';
import { optional, type HttpFetch } from './http.ts';
import type { GeoPoint, IsoDate } from '../composer/types.ts';

const BASE = 'https://api.open-meteo.com/v1/forecast';
const DAILY = 'temperature_2m_max,temperature_2m_min,precipitation_probability_max';

export type WeatherOptions = {
  readonly http: HttpFetch;
  readonly cache: TtlCache;
};

export type DayForecast = {
  readonly date: IsoDate;
  readonly maxC: number;
  readonly minC: number;
  readonly rainChance?: number;
};

type OpenMeteoAnswer = {
  readonly reason?: string;
  readonly daily?: {
    readonly time?: readonly string[];
    readonly temperature_2m_max?: readonly (number | null)[];
    readonly temperature_2m_min?: readonly (number | null)[];
    readonly precipitation_probability_max?: readonly (number | null)[];
  };
};

export async function forecastFor(
  options: WeatherOptions,
  where: GeoPoint,
  from: IsoDate,
  to: IsoDate,
  city?: string,
): Promise<readonly DayForecast[] | undefined> {
  const url =
    `${BASE}?latitude=${where.lat}&longitude=${where.lng}` +
    `&daily=${DAILY}&timezone=auto&start_date=${from}&end_date=${to}`;
  const args = { tool: 'forecast', ...(city === undefined ? {} : { city }) };

  return optional(async () =>
    options.cache.through(cacheKey('open-meteo', 'forecast', { url, ...args }), TTL.weather, async () => {
      const answer = await options.http(url, args);
      const body = answer.body as OpenMeteoAnswer;

      // Beyond the window the service refuses the range outright and says what it will accept.
      // That refusal is the answer: the block is hidden, and history is never substituted.
      if (answer.status !== 200 || body.reason !== undefined) return undefined;

      const days = body.daily?.time ?? [];
      const highs = body.daily?.temperature_2m_max ?? [];
      const lows = body.daily?.temperature_2m_min ?? [];
      const rain = body.daily?.precipitation_probability_max ?? [];

      const forecast = days.flatMap((date, index) => {
        const maxC = highs[index];
        const minC = lows[index];
        if (typeof maxC !== 'number' || typeof minC !== 'number') return [];

        const chance = rain[index];
        return [
          {
            date,
            maxC,
            minC,
            ...(typeof chance === 'number' ? { rainChance: chance } : {}),
          },
        ];
      });

      return forecast.length > 0 ? forecast : undefined;
    }),
  );
}
