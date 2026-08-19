/**
 * The map of the destination city.
 *
 * Leaflet, raster tiles, plain `img` elements. No WebGL and no `blob:` worker, so this survives
 * a host CSP of `default-src 'none'` with a single `img-src` exception - which is the whole
 * reason it is not MapLibre.
 *
 * Two negatives matter as much as the map itself. A venue that was not geocoded precisely draws
 * no marker at all, because a city centre shown as a conference venue is the same lie as an
 * invented field. And tiles that fail to load hide the block rather than leaving an empty grey
 * rectangle behind.
 */

import type { RankedHotel, TripResult } from './types.ts';

/**
 * The vendored Leaflet global, described by what this file uses of it.
 *
 * Leaflet ships no types and there is no bundler to resolve a types package into; declaring the
 * handful of calls made here is smaller, and it fails loudly if one of them changes.
 */
type LatLng = readonly [number, number];

type Marker = { addTo(map: LeafletMap): Marker };

type TileLayer = {
  on(event: 'tileerror', handler: () => void): TileLayer;
  addTo(map: LeafletMap): TileLayer;
};

type LeafletMap = {
  remove(): void;
  removeLayer(layer: unknown): void;
  fitBounds(points: readonly LatLng[], options: { padding: readonly [number, number] }): void;
  setView(centre: LatLng, zoom: number): void;
  invalidateSize(): void;
  readonly _layers?: Readonly<Record<string, unknown>>;
};

type Leaflet = {
  map(container: HTMLElement, options: Record<string, unknown>): LeafletMap;
  tileLayer(url: string, options: Record<string, unknown>): TileLayer;
  marker(at: LatLng, options: Record<string, unknown>): Marker;
  divIcon(options: Record<string, unknown>): unknown;
  readonly Marker: abstract new () => unknown;
};

const L = (globalThis as unknown as { L?: Leaflet }).L;

/**
 * Markers are inline SVG: Leaflet's stock icons are images its CSS fetches by relative URL,
 * and those 404 the moment the stylesheet is inlined into the `ui://` resource.
 */
function pin(colour: string, label?: string): unknown {
  return (L as Leaflet).divIcon({
    className: 'pin',
    html:
      `<svg viewBox="0 0 24 32" width="24" height="32" aria-hidden="true">` +
      `<path d="M12 0C5.4 0 0 5.4 0 12c0 9 12 20 12 20s12-11 12-20C24 5.4 18.6 0 12 0z" fill="${colour}"/>` +
      `<circle cx="12" cy="12" r="5" fill="#fff"/></svg>` +
      (label === undefined ? '' : `<span class="pin__label">${label}</span>`),
    iconSize: [24, 32],
    iconAnchor: [12, 32],
  });
}

let map: LeafletMap | undefined;
/** The element the current map was built on; a re-render replaces it with a fresh one. */
let mapHost: HTMLElement | undefined;

export function drawMap(trip: TripResult | undefined, selectedId?: string): void {
  const container = document.getElementById('map');
  if (container === null || trip === undefined) return;

  const venue = trip.event?.venueLocation;
  const hotels = trip.packages
    .map((item) => item.variant.hotel)
    .filter(
      (entry): entry is RankedHotel & { hotel: { location: { lat: number; lng: number } } } =>
        entry?.hotel.location !== undefined,
    );

  const first = hotels[0];
  const centre: LatLng | undefined =
    venue !== undefined && venue.precision !== 'unknown'
      ? [venue.lat, venue.lng]
      : first !== undefined
        ? [first.hotel.location.lat, first.hotel.location.lng]
        : undefined;

  if (centre === undefined || venue === undefined || L === undefined) {
    container.hidden = true;
    return;
  }
  container.hidden = false;

  // A second render replaces the whole board, `#map` included. A Leaflet instance bound to the
  // element that just left the document draws nothing, so it is thrown away with it.
  if (map !== undefined && mapHost !== container) {
    map.remove();
    map = undefined;
  }

  if (map === undefined) {
    map = L.map(container, { attributionControl: true, scrollWheelZoom: false });
    mapHost = container;
    L.tileLayer('https://tile.openstreetmap.de/{z}/{x}/{y}.png', {
      maxZoom: 18,
      // Public tiles require attribution; this is a condition of use, not decoration.
      attribution: '© OpenStreetMap',
    })
      .on('tileerror', () => {
        // Tiles refused. Better no map than a grey rectangle pretending to be one.
        container.hidden = true;
      })
      .addTo(map);
  }

  for (const layer of Object.values(map._layers ?? {})) {
    if (layer instanceof L.Marker) map.removeLayer(layer);
  }

  const points: LatLng[] = [];

  // Only a precisely located venue earns a marker. A city centre is not a venue.
  if (venue.precision === 'exact') {
    L.marker([venue.lat, venue.lng], { icon: pin('#6f5df6'), title: 'Площадка' }).addTo(map);
    points.push([venue.lat, venue.lng]);
  }

  for (const entry of hotels) {
    const { lat, lng } = entry.hotel.location;
    const chosen = trip.packages.some(
      (item) => item.variant.id === selectedId && item.variant.hotel?.hotel.id === entry.hotel.id,
    );
    L.marker([lat, lng], {
      icon: pin(chosen ? '#f76b3b' : '#8b87ff', entry.hotel.name),
      title: entry.hotel.name,
    }).addTo(map);
    points.push([lat, lng]);
  }

  if (points.length > 1) map.fitBounds(points, { padding: [32, 32] });
  else map.setView(centre, 13);

  // Inside an iframe the container is often sized after the map is built.
  const built = map;
  requestAnimationFrame(() => built.invalidateSize());
}

export function resizeMap(): void {
  map?.invalidateSize();
}
