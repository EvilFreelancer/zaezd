import assert from 'node:assert/strict';
import { Given, Then, When } from '@cucumber/cucumber';
import {
  labelForCheckout,
  type CheckoutLabel,
  type CheckoutProduct,
} from '../../src/composer/checkout-labels.ts';
import { loadPayload } from '../support/fixtures.ts';
import type { ZaezdWorld } from '../support/world.ts';

const PRODUCTS: Readonly<Record<string, CheckoutProduct>> = {
  flight: 'avia',
  train: 'railway',
};

Given('Tutu returned a link of kind {string}', function (this: ZaezdWorld, kind: string) {
  this.remember('kind', kind);
});

Given('Tutu returned a link with no kind', function (this: ZaezdWorld) {
  this.remember('kind', undefined);
});

Given(
  'Tutu returned a link of kind {string} for a {word}',
  function (this: ZaezdWorld, kind: string, what: string) {
    const product = PRODUCTS[what];
    assert.ok(product !== undefined, `nobody mapped "${what}" to a Tutu product`);

    this.remember('kind', kind);
    this.remember('product', product);
  },
);

Given(
  'the recorded checkout link built without a room rate',
  function (this: ZaezdWorld) {
    this.remember('kind', loadPayload<{ kind?: string }>('tutu/checkout-hotel-page-1.json').kind);
    this.remember('product', 'hotels');
  },
);

Given('the recorded checkout link built with a room rate', function (this: ZaezdWorld) {
  this.remember('kind', loadPayload<{ kind?: string }>('tutu/checkout-hotel-cart-1.json').kind);
  this.remember('product', 'hotels');
});

When('the button is labelled', function (this: ZaezdWorld) {
  this.remember(
    'label',
    labelForCheckout(
      this.recall<string | undefined>('kind'),
      this.scratch.has('product') ? this.recall<CheckoutProduct>('product') : undefined,
    ),
  );
});

function label(world: ZaezdWorld): CheckoutLabel {
  return world.recall<CheckoutLabel>('label');
}

Then('the button reads {string}', function (this: ZaezdWorld, text: string) {
  assert.equal(label(this).text, text);
});

Then('the button promises a cart', function (this: ZaezdWorld) {
  assert.equal(label(this).opensACart, true);
});

Then('the button does not promise a cart', function (this: ZaezdWorld) {
  assert.equal(label(this).opensACart, false);
});

Then('the button carries no warning', function (this: ZaezdWorld) {
  assert.equal(label(this).caveat, undefined);
});

const CAVEATS: Readonly<Record<string, RegExp>> = {
  'Tutu did not say what will open': /не сказал/,
  'a browser without a Tutu session lands on search': /без активной сессии/,
};

Then(/^the button warns that (.+)$/, function (this: ZaezdWorld, phrase: string) {
  const expected = CAVEATS[phrase];
  assert.ok(expected !== undefined, `the feature used a warning nobody mapped: "${phrase}"`);
  assert.match(label(this).caveat ?? '', expected);
});
