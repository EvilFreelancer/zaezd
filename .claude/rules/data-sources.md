---
description: "confcal and Tutu clients, normalization, cache TTL, degradation"
paths:
  - "src/sources/**/*.ts"
  - "src/enrich/**/*.ts"
---

# Data sources: clients, normalization, degradation

`src/sources/` speaks protocol and normalizes; `src/enrich/` adds optional context. Raw
third-party JSON stops at this boundary: above it only domain types travel. Full reference
in `specs/03-istochniki.md` and `ideas/01-tutu-mcp-obzor.md`.

## Traps that were measured, not guessed

- **Hotel `geo_id` and transport `geo_id` are different namespaces.** A hotel id may only
  come from a previous `search_hotels` response (`meta.geo_id` / `meta.resolved_geo`).
  Passing a transport id yields an empty `hotels[]` next to perfectly live transport.
- **Hotel price is the whole stay** (`price_basis: "stay_total"`). Never per night.
- **`search_multitransport` fails softly per mode.** An empty array for one mode while the
  others are populated is a partial failure. Log it; never report "there are no flights".
- **Multitransport counts adults only.** Children require the per-mode searches, which the
  MVP does not do. Say so in the limitations, do not silently drop passengers.
- **Ground transport takes a city, not a station,** even though the response names the
  station.
- **`checkout_ref`, `search_id`, availability and prices expire.** They are never cached and
  never stored in a snapshot; checkout links are rebuilt live at click time.
- **confcal requires a session.** `mcp-session-id` comes from `initialize` and is required
  afterwards; it dies with the process. Re-initialize once automatically on a session error
  and retry the call. Keep concurrency at one until parallel calls through one session are
  proven safe. Never mix confcal headers into the Tutu client, which has no session at all.
- **confcal has no coordinates.** `venue` is free text ("РУДН, Москва", "YADRO", `null`).
  Geocoding is mandatory and will fail often; falling back to the city centre is a normal
  mode of operation, not an exception.
- **`starts_at` may be null.** Then only the date is known and feasibility relaxes.
- **confcal has no event end time at all.** The field set is `id`, `title`, `url`,
  `start_date`, `end_date`, `starts_at`, `city`, `city_slug`, `venue`, `format`, `is_free`,
  `price`, `topics`, `tags`, `program_url`, `description`. The check-out day is therefore
  always `end_date` plus one.
- **OSRM must run the foot profile.** The public `router.project-osrm.org` serves the car
  profile only; measured on one pair of points in Kazan it answered 269 s where
  `routing.openstreetmap.de/routed-foot` answered 847 s on the same pair. Labelling a car
  route "N мин пешком" is a lie. Use the foot profile, and when it is unavailable show no
  walking time at all.
- **Tutu responses arrive as a JSON string inside a text block,** with no `outputSchema`.
  Parse in one place, in `normalize.ts`.

## Forgiving input, strict output

Array arguments are accepted in three shapes, because that is what agents actually send:
a real array `["ai","data"]`, a JSON string `"[\"ai\",\"data\"]"`, and a comma-separated
string `"ai, data"`. Numbers arriving as strings are coerced. A call with no arguments is
an empty object. Normalization happens once, at the boundary, before the composer, and the
cache key is built from the normalized form, so all three shapes hit the same entry.

Everything leaving this layer is a domain type with `unknown` fully narrowed. Fields the
source did not return stay `undefined`; nothing is filled in from general knowledge.

## Cache and modes

| What | TTL |
|---|---|
| confcal cities and topics | process lifetime |
| confcal events | 10 minutes |
| venue geocoding | one day, on disk |
| production calendar | process lifetime |
| transport and hotel searches | 5 minutes |
| `checkout_ref`, `search_id` | never cached |

`ZAEZD_MODE=live` calls the sources and caches; `ZAEZD_MODE=replay` reads `fixtures/` and
never opens a socket. Recording is `scripts/record.ts`, not a third server mode.

Every fixture is an envelope, not a bare payload: `recorded_at`, `source`, `tool`,
`arguments`, `response`, and `volatile: true` on anything that expires (`checkout_ref`,
`search_id`, ready-made `checkout_url`). `fixtures/manifest.json` maps a normalized request
to its snapshot date and file. In `replay` the reference "today" is `recorded_at`, otherwise
recorded events silently become past events and the suite rots on its own. A `volatile`
field is good for parsing and is never checked for liveness.

The two modes also settle the checkout question. In `live` a checkout link is rebuilt at
click time. In `replay` it comes from the recording and is labelled as recorded, with its
snapshot date and a warning that it has most likely expired. Neither mode passes a recorded
link off as a live one.

## Timeouts and fallbacks

| Source | Timeout | On failure |
|---|---|---|
| confcal | 8 s | error screen; without events there is no product |
| Tutu transport | 12 s | no package is assembled, the reason is shown |
| Tutu hotels | 12 s | packages without a hotel, labelled as such |
| Nominatim | 4 s | city centre, no marker, no walking time |
| OSRM | 4 s | walking-time block hidden |
| Open-Meteo | 4 s | weather block hidden (also hidden beyond the 16-day window) |
| isDayOff | 4 s | working-days block hidden |

No fallback ever invents a value. Absence renders as absence.

Nominatim additionally requires a contactable `User-Agent`, at most one request per second,
OpenStreetMap attribution in the UI, and a cache so a repeated `venue` is never re-queried.

## References

`.claude/rules/architecture.md`
`.claude/rules/composer-core.md`
`.claude/rules/code-style.md`
