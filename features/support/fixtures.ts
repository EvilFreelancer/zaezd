/**
 * Reads the recorded payloads in `fixtures/` for the executable specifications and the unit
 * tests.
 *
 * It lives under `features/support/` because the Gherkin specifications are the primary
 * contract in this repository, and the unit tests import it from here rather than keeping a
 * second copy. It deliberately does nothing but open the envelope: no field renaming, no
 * domain parsing, nothing that could drift from `src/sources/normalize.ts`.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const FIXTURES_ROOT = resolve(import.meta.dirname, '../../fixtures');

export type FixtureEnvelope = {
  readonly recorded_at: string;
  readonly source: string;
  readonly tool: string;
  readonly arguments: Readonly<Record<string, unknown>>;
  readonly note?: string;
  readonly volatile?: readonly string[];
  readonly response: unknown;
};

export function loadEnvelope(name: string): FixtureEnvelope {
  return JSON.parse(readFileSync(resolve(FIXTURES_ROOT, name), 'utf8')) as FixtureEnvelope;
}

/**
 * The inner object Tutu and confcal hide as a JSON string inside a text block. HTTP sources
 * have no such wrapper and expose `response.body` instead.
 */
export function loadPayload<T>(name: string): T {
  const { response } = loadEnvelope(name);
  const shaped = response as { payload?: unknown; body?: unknown };
  return (shaped.payload ?? shaped.body ?? response) as T;
}

/**
 * The moment a fixture was captured. This is what replay uses as "today", so a recorded
 * future event never quietly becomes a past one and reddens the suite on its own.
 */
export function recordedAt(name: string): string {
  return loadEnvelope(name).recorded_at;
}
