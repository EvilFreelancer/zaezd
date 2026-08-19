import assert from 'node:assert/strict';
import { Given, Then, When } from '@cucumber/cucumber';
import type { ZaezdWorld } from '../support/world.ts';

Given('the harness records the value {int}', function (this: ZaezdWorld, value: number) {
  this.remember('value', value);
});

When('the harness reads the recorded value', function (this: ZaezdWorld) {
  this.remember('read', this.recall<number>('value'));
});

Then('the recorded value is {int}', function (this: ZaezdWorld, expected: number) {
  assert.equal(this.recall<number>('read'), expected);
});
