import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import * as z4mini from 'zod/v4-mini';
import { JSON_SCHEMA_DIALECT, withCurrentDialect } from '../src/mcp/dialect.ts';
import {
  CHECKOUT_INPUT,
  CHECKOUT_OUTPUT,
  DETAILS_INPUT,
  DETAILS_OUTPUT,
  FIND_INPUT,
  FIND_OUTPUT,
} from '../src/mcp/schemas.ts';

const PUBLISHED = {
  FIND_INPUT,
  FIND_OUTPUT,
  DETAILS_INPUT,
  DETAILS_OUTPUT,
  CHECKOUT_INPUT,
  CHECKOUT_OUTPUT,
} as const;

const OLD_DIALECT = 'http://json-schema.org/draft-07/schema#';

/** The body zod emits for one shape at one target, with the dialect label taken off. */
function bodyAt(shape: unknown, target: 'draft-7' | 'draft-2020-12', io: 'input' | 'output') {
  const emitted = z4mini.toJSONSchema(z.object(shape as never) as never, { target, io }) as Record<
    string,
    unknown
  >;
  const { $schema, ...body } = emitted;
  expect($schema).toBeTypeOf('string');
  return body;
}

describe('the dialect the schemas are published in', () => {
  // This is the licence for relabelling instead of converting. The day a schema starts using
  // a construct the two drafts spell differently, this goes red first and `dialect.ts` has to
  // grow a real conversion.
  it.each(Object.keys(PUBLISHED))('emits one body for both drafts: %s', (name) => {
    const shape = PUBLISHED[name as keyof typeof PUBLISHED];
    const io = name.endsWith('OUTPUT') ? 'output' : 'input';

    expect(bodyAt(shape, 'draft-2020-12', io)).toEqual(bodyAt(shape, 'draft-7', io));
  });
});

describe('withCurrentDialect, the label a host actually validates against', () => {
  const listing = (schema: Record<string, unknown>) => ({
    jsonrpc: '2.0' as const,
    id: 1,
    result: {
      tools: [
        { name: 'find_event_trips', inputSchema: schema, outputSchema: schema },
        { name: 'get_trip_details', inputSchema: schema },
      ],
    },
  });

  it('publishes what the SDK stamped draft-07 as the current draft', () => {
    const answer = withCurrentDialect(listing({ $schema: OLD_DIALECT, type: 'object' }));
    const [first, second] = answer.result.tools;

    expect(first?.inputSchema['$schema']).toBe(JSON_SCHEMA_DIALECT);
    expect(first?.outputSchema?.['$schema']).toBe(JSON_SCHEMA_DIALECT);
    expect(second?.inputSchema['$schema']).toBe(JSON_SCHEMA_DIALECT);
  });

  it('keeps the schema body exactly as it was', () => {
    const schema = { $schema: OLD_DIALECT, type: 'object', properties: { a: { type: 'string' } } };
    const answer = withCurrentDialect(listing(schema));
    const { $schema, ...body } = answer.result.tools[0]?.inputSchema ?? {};

    expect(body).toEqual({ type: 'object', properties: { a: { type: 'string' } } });
    expect($schema).toBe(JSON_SCHEMA_DIALECT);
  });

  it('changes nothing when the label is already current', () => {
    const listed = listing({ $schema: JSON_SCHEMA_DIALECT, type: 'object' });

    expect(withCurrentDialect(listed)).toEqual(listed);
  });

  it('leaves a dialect nobody asked us to touch alone', () => {
    const listed = listing({ $schema: 'http://json-schema.org/draft-04/schema#', type: 'object' });

    expect(withCurrentDialect(listed)).toEqual(listed);
  });

  it('invents no schema for a tool that publishes none', () => {
    const listed = { jsonrpc: '2.0' as const, id: 1, result: { tools: [{ name: 'bare' }] } };

    expect(withCurrentDialect(listed)).toEqual(listed);
  });

  it('does not reach into an answer that is not a tool listing', () => {
    const answer = {
      jsonrpc: '2.0' as const,
      id: 2,
      result: {
        structuredContent: { schemas: [{ $schema: OLD_DIALECT }] },
        content: [{ type: 'text', text: 'Заезд' }],
      },
    };

    expect(withCurrentDialect(answer)).toEqual(answer);
  });

  it('passes a request through untouched', () => {
    const request = { jsonrpc: '2.0' as const, id: 3, method: 'tools/list', params: {} };

    expect(withCurrentDialect(request)).toEqual(request);
  });
});
