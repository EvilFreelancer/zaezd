---
description: "Trip board screen, states, honesty, Kite tokens, adaptivity"
paths:
  - "src/web/**/*.ts"
  - "src/web/**/*.html"
  - "src/web/**/*.css"
---

# Web UI: the trip board

UX is worth 20 points, more than any other criterion, and this is the only screen. The same
skeleton and the same client renderer also ship as the `ui://zaezd/trip-board` resource, so
**one renderer serves both channels**. Only the data path differs: the web page reads the
`TripResult` the server embedded, the MCP App receives it through
`ui/notifications/tool-result`. Recompute differs too - a form on our own origin in the web,
`tools/call` through the host in the App. Nothing else may fork.

No arithmetic in the browser. The `TripResult` arrives computed; the renderer lays out
numbers it was given. A `noscript` block carries a text summary of the trip.
Full specification in `specs/05-interfeys.md`.

## The first thirty seconds

The public link opens on an already computed trip, never on an empty form. The input row
sits on top, pre-filled. Chat, if it exists at all, is a side panel and never the main way
to work.

## Layout and card

Header answers "where and why", cards answer "how and how much", the map answers "where
exactly", the timeline answers "do I make it".

A package card carries exactly six things: the selection rule name, the total participation
price as one number, the outbound leg with transport type, number and buffer to the opening,
the hotel with its name, whole-stay price and walking time to the venue, the return leg,
and a budget bar broken into transport, stay and event with any overflow visible. Under the
bar, one line of arithmetic that adds up:

```
поезд 2 090 ₽ + отель 12 800 ₽ + обратно 2 090 ₽ = 16 980 ₽, остаток 13 020 ₽
```

A variant flagged "arrives after the opening" renders grey and cannot be selected as the
primary package.

## Honesty in the interface

- Prices are rendered exactly as they appear in the payload, without rounding.
- A field the source did not return is shown as missing, never inferred.
- A venue that was not geocoded precisely gets no marker at all; the map centres on the
  city and a caption says the catalogue did not provide an address.
- Button labels come from the actual checkout `kind` (`.claude/rules/mcp-layer.md`), so "Открыть
  поиск, корзины не будет" is a label that really ships.
- Catalogue coverage is stated plainly: live offline events exist in five or six cities,
  and empty cities are not hidden.
- Resolved geography is named back from `meta.resolved_geo`, including a homonym note when
  `also_named[]` is present. Reviews are quoted verbatim with their date or not at all.

## States, all of them

The most common way a hackathon UI looks unfinished is missing states. All of these are
implemented:

- **Progressive load.** Stages, not a spinner: "события найдены", "транспорт рассчитан",
  "отели загружаются". Cards appear as they become ready.
- **Empty**, with a different text per cause: the event is online, the city has no offline
  events on this topic, nothing makes the opening, the budget does not fit.
- **Source error**, naming what failed and what fallback is shown.
- **Stale snapshot**, with the snapshot time and a refresh button.
- **Imprecise venue**, its own state because it happens often.

## Map and timeline

Leaflet with raster tiles, vendored locally, markers as `L.divIcon` with inline SVG. No
stock Leaflet marker images: their CSS references them by relative URL and they 404 once the
CSS is inlined for the `ui://` channel. Inside an iframe call `invalidateSize` after the
handshake and after every resize, or the map renders into a stale box.

Destination city only. Venue as an anchor marker, hotels as price chips, the selected
variant highlighted, clicking a marker selects its card. No cross-country route line: it
destroys the scale at either zoom level. OpenStreetMap attribution is mandatory, and the
tile provider must be one whose usage policy allows this - `tile.openstreetmap.org` does
not. If tiles fail to load, hide the map block and render the hotels as a list with their
distances; an empty grey rectangle is worse than no map. Hotel photos from `cdn1.tu-tu.ru` and
`cdn2.tu-tu.ru` need those domains in the CSP; an image that fails to load removes itself,
because a torn frame in a card is worse than no picture.

The timeline runs from departure to return and marks departure, arrival, event start, event
end, return departure, return arrival, with the buffer as a coloured span. It shows
feasibility better than the map does.

## Style, adaptivity, accessibility

Local Kite token extract, vendored at `src/web/public/vendor/kite/` with its provenance in
`src/web/public/vendor/README.md`. Product purple `#6f5df6`, not the slide `#816dff`. Do not
pull the 384 KB `index.css` from a third-party CDN. Every colour in `styles.css` reads a
`--tutu-*` token; no brand value is written literally outside the vendored extract.

Copying colours is not enough: hover, focus, loading and error states are what the score is
made of. Follow the host theme - the extract keys its dark palette off `data-theme`, so
`boot.js` sets that from `prefers-color-scheme` in the browser and from the host handshake
inside an App. Verify contrast on light.

Three widths are checked: 360, 768, 1280. On mobile the cards come first, the map shrinks
to 240-320 px, and the checkout button stays clear of the back gesture. Keyboard focus,
contrast, long-name overflow and the absence of horizontal scroll are verified by Playwright
(`npm run test:ui`), not by eye - Cucumber on Node cannot see any of it.

Every string that came from confcal or Tutu is escaped on the way out, in text, in
attributes, in URLs and inside the embedded JSON. Event and hotel names are third-party
input and are treated as such.

## References

`.claude/rules/mcp-layer.md`
`.claude/rules/architecture.md`
`.claude/rules/bdd-specs.md`
