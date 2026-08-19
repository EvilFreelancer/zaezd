# Vendored third-party assets

These files are committed rather than installed, because the demo must not depend on a
third-party CDN staying up, and because the `ui://` resource has to work under a host CSP
that forbids external scripts and stylesheets.

| Directory | What | Version | Licence | Source |
|---|---|---|---|---|
| `leaflet/` | Leaflet map library, `leaflet.js` and `leaflet.css` | 1.9.4 | BSD-2-Clause, see `leaflet/LICENSE` | npm package `leaflet@1.9.4` |
| `kite/` | extract of Tutu's Kite design tokens as `--tutu-*` custom properties | Kite 5.10.0, snapshot of 2026-08-19 | Tutu's own published CSS; only token values are reused, no code | `cdn1.tu-tu.ru/lib-assets/@tutu/kite@5.10.0/` |

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
```

Update the version in the table above in the same change, and re-run `npm run test:ui`.
