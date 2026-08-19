# Recorded source payloads

Every specification in `features/`, every unit test in `tests/` and every `ZAEZD_MODE=replay`
run reads from here. Nothing else in the repository is allowed to open a socket as a matter
of routine; the live calls live in `scripts/record.ts`.

```bash
npm run record              # re-record everything and rewrite manifest.json
npm run record -- confcal   # one group: confcal | tutu | enrich
```

## The envelope

A fixture is never a bare payload.

```json
{
  "recorded_at": "2026-08-19T09:41:22.310Z",
  "source": "tutu",
  "tool": "search_hotels",
  "arguments": { "city_name": "Екатеринбург", "check_in": "2026-08-26" },
  "note": "why this file exists",
  "volatile": ["hotels[].checkout_ref", "meta.search_id"],
  "response": { "envelope": { "jsonrpc": "2.0" }, "payload": { "hotels": [] } }
}
```

`recorded_at` is the reference "today" in replay. Without it every recorded event silently
becomes a past event a week later and the suite goes red on its own, blaming the composer for
the calendar.

`volatile` names the fields that expire. `checkout_ref`, `search_id` and any ready-made
`checkout_url` are good for exercising a parser and are never checked for liveness. A replay
screen labels its checkout links as recorded; only `ZAEZD_MODE=live` rebuilds them at click
time.

`response.envelope` is the raw MCP frame, `response.payload` is the JSON that Tutu hides as a
string inside a text block. Both are kept: the envelope is what the client has to survive, the
payload is what the tests read.

`manifest.json` lists every file with its arguments and snapshot date, so a fixture can be
traced back to the request that produced it without guessing from the filename.

## What is recorded and why

The demo is not typed in by hand. `scripts/record.ts` reads the catalogue, runs the product's
own `eventQueryFor` and `selectEvents` over the answer, and records transport, hotels and
enrichment for whatever the product would actually choose. A demo pinned to an event id rots
the moment the catalogue moves on, and - worse - records answers to questions the product will
never ask, which shows up as replay refusing every lookup while looking exactly like an outage.

That is also why fixtures are named by their role rather than by a city: `demo-out.json` is
"the journey there", whichever city that turns out to be this month.

### confcal

| File | What it proves |
|---|---|
| `initialize.json` | the session id arrives in the `mcp-session-id` response header, not in the body |
| `session-lost.json` | what an expired session looks like, so the client can re-initialize once and retry |
| `list-cities.json`, `list-topics.json` | the catalogue directories and their event counters |
| `list-cities-page-2.json` | pagination, so coverage is not computed from page one and called the whole catalogue |
| `events-ai-offline.json` | the working set, asked exactly as the product asks it: every city that has events, minus home |
| `events-ai-online.json` | online events, which build no trip |
| `events-ai-moscow.json` | events in the origin city, which build no trip either |
| `events-empty.json` | an empty answer that still owes the user a coverage note |

### Tutu

| File | What it proves |
|---|---|
| `demo-out.json`, `demo-back.json` | both legs of the demo; the return leg is not optional, without it the total is knowably wrong |
| `demo-hotels.json` | hotel coordinates arrive in the listing, so distance sorting needs no extra call; `price_basis: "stay_total"` is on every price |
| `degraded-*.json` | the same three calls for the showcase event that has neither an opening time nor a venue |
| `multitransport-thin-route.json` | `meta.unavailable` naming a mode that failed upstream, next to modes that simply have no offers. An empty array is not proof that a mode does not exist |
| `offer-details.json` | the room rates, each with its own `offerpack_hash` |
| `error-extra-key.json` | the pydantic `extra_forbidden` error every agent hits sooner or later |

Checkout links, one per observed `kind`, because the button label is derived from what Tutu
actually returned and cannot be tested against invented values:

| File | `kind` | Label it earns |
|---|---|---|
| `checkout-hotel-cart.json` | `checkout_deeplink` | Открыть корзину |
| `checkout-hotel-page.json` | `deeplink` | Открыть страницу выбора |
| `checkout-rail.json` | `deeplink` | Открыть страницу выбора |
| `checkout-avia.json` | `deeplink` | Открыть страницу выбора |

The two hotel links differ by one argument. `checkout-hotel-page.json` passes the listing
`checkout_ref` and gets a hotel page; `checkout-hotel-cart.json` adds a room rate's
`offer_pack_hash` from `get_offer_details` and gets a real cart. This is exactly the trap the
product must not fall into, and it is a recorded fact rather than a warning in a document.

`search_redirect` and `order_url` were not returned by any live call during recording, so the
label table covers them by unit test rather than by fixture. Which kinds have been observed
live is stated here rather than implied.

### Enrichment

The Nominatim files are the precision ladder, recorded in the order the geocoder actually
descends it: the venue string as the catalogue wrote it, the address pulled out of it, the
city. A company name is recorded separately because it resolves to something plausible and
nearly meaningless, which is the case precision must not be claimed for.

`osrm-foot.json` and `osrm-car.json` are the same pair of points on both profiles. The public
`router.project-osrm.org` serves the car profile only, which is why a walking time may come
from `routing.openstreetmap.de/routed-foot` or from nowhere.

`isdayoff-*.json` covers every month the recorded trips touch, including any boundary they
cross. The body is a bare string of digits, one per day, stored as a string on purpose:
`JSON.parse` would turn `"1100000110000011"` into `1.1e15` and destroy the calendar without any
error at all.

`openmeteo-in-window.json` is the forecast at the venue, inside the sixteen-day window at the
time of recording. `openmeteo-out-of-window.json` is the refusal, and it is worth reading:
Open-Meteo does not return an empty forecast, it rejects the range and names its bounds. The
weather block is hidden; history is never substituted for a forecast.
