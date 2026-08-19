/**
 * What starts the board, in whichever channel it finds itself.
 *
 * On the web the `TripResult` is already in the document; in an MCP App it arrives from the
 * host after loading, because an App resource is fetched independently of the tool call. The
 * renderer is the same either way - that is the whole point of splitting them.
 */
import { renderTrip } from './render.ts';
import { drawMap } from './map.ts';
import type { CheckoutLink, TripResult } from './types.ts';

const root = document.documentElement;
root.dataset['js'] = 'on';

/**
 * The vendored Kite extract keys its dark palette off `data-theme` and has no media query of
 * its own, so the platform preference is applied here. Inside a host this is overwritten by
 * the theme the host reports.
 */
const dark = window.matchMedia('(prefers-color-scheme: dark)');
const applyTheme = (isDark: boolean): void => {
  root.dataset['theme'] = isDark ? 'dark' : 'light';
};
applyTheme(dark.matches);
dark.addEventListener('change', (event) => applyTheme(event.matches));

const board = document.getElementById('board');

let current: TripResult | undefined;
let selectedId: string | undefined;

function show(trip: TripResult): void {
  current = trip;
  if (board !== null) renderTrip(board, trip, { onSelect: select });
  drawMap(trip, selectedId);
}

function select(variantId: string): void {
  selectedId = variantId;
  for (const card of document.querySelectorAll('.card')) {
    const mine = card instanceof HTMLElement && card.dataset['variant'] === variantId;
    card.setAttribute('aria-pressed', mine ? 'true' : 'false');
    card.classList.toggle('card--chosen', mine);
  }
  drawMap(current, selectedId);
}

const embedded = document.getElementById('trip-data');
if (embedded !== null) {
  show(JSON.parse(embedded.textContent ?? '{}') as TripResult);
}

document.addEventListener('click', async (event) => {
  const target = event.target;
  if (!(target instanceof Element)) return;

  const button = target.closest('.card__checkout');
  if (!(button instanceof HTMLButtonElement) || current === undefined) return;

  event.stopPropagation();
  button.disabled = true;
  button.textContent = 'Собираем ссылки…';

  try {
    const response = await fetch('/api/checkout', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ request: current.request, variantId: button.dataset['variant'] }),
    });
    const links = (await response.json()) as readonly CheckoutLink[];
    button.replaceWith(checkoutList(links));
  } catch {
    button.disabled = false;
    button.textContent = 'Не получилось, попробовать ещё раз';
  }
});

function checkoutList(links: readonly CheckoutLink[]): HTMLElement {
  const list = document.createElement('ul');
  list.className = 'checkout';

  for (const link of links) {
    const item = document.createElement('li');
    item.className = 'checkout__item';

    const anchor = document.createElement('a');
    anchor.className = `checkout__link${link.opensACart ? ' checkout__link--cart' : ''}`;
    anchor.href = link.url;
    anchor.target = '_blank';
    anchor.rel = 'noopener';
    anchor.textContent = link.label;
    item.append(anchor);

    if (link.caveat !== undefined) {
      const note = document.createElement('span');
      note.className = 'checkout__caveat';
      note.textContent = link.caveat;
      item.append(note);
    }
    if (link.recorded === true) {
      const note = document.createElement('span');
      note.className = 'checkout__caveat';
      note.textContent = 'Ссылка из записи, скорее всего уже протухла';
      item.append(note);
    }
    list.append(item);
  }
  return list;
}

export { show, select };
