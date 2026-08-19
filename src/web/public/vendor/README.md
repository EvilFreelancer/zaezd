# Vendored third-party assets

These files are committed rather than installed, because the demo must not depend on a
third-party CDN staying up, and because the `ui://` resource has to work under a host CSP
that forbids external scripts and stylesheets.

| Directory | What | Version | Licence | Source |
|---|---|---|---|---|
| `leaflet/` | Leaflet map library, `leaflet.js` and `leaflet.css` | 1.9.4 | BSD-2-Clause, see `leaflet/LICENSE` | npm package `leaflet@1.9.4` |
| `kite/` | extract of Tutu's Kite design tokens as `--tutu-*` custom properties | Kite 5.10.0, snapshot of 2026-08-19 | Tutu's own published CSS; only token values are reused, no code | `cdn1.tu-tu.ru/lib-assets/@tutu/kite@5.10.0/` |
| `mcp-apps/` | the MCP Apps browser bridge, `app.js` | 1.7.5 | Apache-2.0, with older contributions still under MIT; see `mcp-apps/LICENSE` | npm package `@modelcontextprotocol/ext-apps@1.7.5`, file `dist/src/app-with-deps.js` |

Two things are deliberately absent.

**Leaflet's marker images.** `leaflet.css` references `images/marker-icon.png` by relative
URL, and those references 404 the moment the CSS is inlined into the `ui://` resource. All
markers in this project are `L.divIcon` with inline SVG, so the image directory is not
vendored at all.

**The full Kite `index.css`.** It is 384 KB and would be pulled from Tutu's CDN. Only the
token extract is used; how it was produced is documented in `ideas/08-ui-kit.md`.

## Updating

```bash
npm pack leaflet@<version> && tar xzf leaflet-<version>.tgz
cp package/dist/leaflet.js package/dist/leaflet.css package/LICENSE src/web/public/vendor/leaflet/

cp node_modules/@modelcontextprotocol/ext-apps/dist/src/app-with-deps.js \
   src/web/public/vendor/mcp-apps/app.js
cp node_modules/@modelcontextprotocol/ext-apps/LICENSE src/web/public/vendor/mcp-apps/LICENSE
```

The bridge is a 330 KB module and is fetched only inside a host: the page imports it lazily,
from the branch that runs when the channel is `app`, so a browser opening the public link never
downloads it.

Update the version in the table above in the same change, and re-check the screen in a
browser: a vendored file that fails to load is invisible to every test that runs on Node.
