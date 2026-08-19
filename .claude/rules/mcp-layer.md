---
description: "The three outward MCP tools, outputSchema, checkout labels, ui resource"
paths:
  - "src/mcp/**/*.ts"
---

# MCP layer: three tools and one widget

`src/mcp/` exposes the product to agents. It is an adapter: it validates input, calls the
orchestrator, and shapes the answer. No business logic lives here.

## The three tools

| Tool | Arguments | Returns |
|---|---|---|
| `find_event_trips` | `topics[]`, `origin`, `budget?`, `date_from?`, `date_to?`, `adults?` | the event, up to three packages, the coverage note, a link to the web version |
| `get_trip_details` | `trip_id`, `package` | package details, hotel, rates, weather when available |
| `create_trip_checkout` | `trip_id`, `package` | a checklist of two or three links, each carrying its actual `kind` |

These exact names appear in the code, the README, the user guide and the architecture
diagram. Renaming one means renaming it everywhere in the same change.

- All three declare `outputSchema` and return `structuredContent`. This is precisely the
  gap measured in Tutu MCP, and closing it removes a whole class of client parse errors.
- Annotations are honest: `readOnlyHint: true` and `destructiveHint: false` on all three,
  `idempotentHint: false` on `create_trip_checkout` because the links expire.
- Input validation is forgiving (see `.claude/rules/data-sources.md`): arrays accepted as array, JSON
  string or comma-separated string; numeric strings coerced; a missing argument object
  treated as empty. Reject nothing that can be understood.

## What this layer must not do

- Proxy raw Tutu tools outward. The point of the gateway is a product contract of three
  verbs, not a re-export of sixteen searches.
- Keep trip state on the server. `trip_id` is a compact encoding of the request, not a key
  in a store, and `/t/:id` is reproducible from it alone.
- Create a cart. The user opens the link and the cart appears in their own Tutu session.
  That is Tutu's legal model and it is not ours to work around.
- Store a checkout link in a snapshot. Links are rebuilt live on click; if the live call
  fails, fall back to `search_results_url` with an honest label.

## Checkout labels

The button text is derived from the `kind` Tutu actually returned, never assigned in
advance.

| `kind` | Label |
|---|---|
| `checkout_deeplink` | Открыть корзину |
| `deeplink` | Открыть страницу выбора |
| `search_redirect` | Открыть поиск, корзины не будет |
| `order_url`, `seats_url` | Открыть заказ |

Air deeplinks open a cart only in a browser with a live Tutu session, so in a cold browser
they land on search. The demo therefore leads with rail plus hotel and offers air as an
explicitly labelled alternative. `passengers_full` / `child` / `infant` from `checkout_ref`
are always forwarded, otherwise the cart opens for one adult and the sum stops matching
the card.

## The `ui://` resource

One resource, `ui://zaezd/trip-board`, `mimeType: text/html;profile=mcp-app`, serving the
**same skeleton and the same client renderer** as the web screen. What differs is where the
data comes from: the web page has the `TripResult` embedded by the server, this resource
receives it from the host through `ui/notifications/tool-result`, because the resource loads
independently of the tool call. Two renderers would drift and the UX score would suffer on
whichever channel the judge actually opens.

`_meta.ui.csp` declares `connectDomains` (our host) and `resourceDomains`
(`cdn1.tu-tu.ru`, `cdn2.tu-tu.ru`, the tile server). The tool links to the resource through
`_meta.ui.resourceUri` with `visibility: ["model", "app"]`.

The protocol is not hand-rolled. `@modelcontextprotocol/ext-apps` (MIT) provides the server
helpers `registerAppTool` and `registerAppResource` and a pre-bundled browser build,
`app-with-deps.js`, that loads without a bundler. Writing JSON-RPC over `postMessage` by
hand is exactly the kind of reinvention this repository is graded against.

Inside the iframe use only: `ui/initialize`, `ui/notifications/tool-result`, `tools/call`,
`ui/open-link`, `ui/update-model-context`.

CSP is the main practical risk: the host defaults to `default-src 'none'`. This is why the
map is Leaflet and not MapLibre - raster tiles as plain `img` need one `img-src` exception
and nothing else, no WebGL and no `blob:` worker. Verify in a real MCP host, since a plain
browser does not reproduce the iframe restrictions. Order of work: browser first, then the
same page in an iframe with a deliberately strict CSP, then inside the agent. If the tiles
cannot load there, the map block is hidden and the hotels render as a list with distances,
never as an empty grey rectangle. Inside an iframe Leaflet also needs `invalidateSize`
after the handshake and after every container resize.

## Hosts

Claude Desktop renders `ui://` natively and is the primary widget channel; Codex is the
text channel and must read well from `structuredContent` alone. Both run strong models, so
do not degrade the payload for small ones.

## References

`.claude/rules/architecture.md`
`.claude/rules/web-ui.md`
`.claude/rules/data-sources.md`
