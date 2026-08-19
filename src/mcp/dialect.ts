/**
 * The dialect the tool schemas are published in.
 *
 * The SDK converts our zod shapes with zod's `draft-7` target and stamps the result
 * `http://json-schema.org/draft-07/schema#`. That target is not ours to choose:
 * `toJsonSchemaCompat` in `@modelcontextprotocol/sdk` 1.30 is handed no target by
 * `registerTool`, and 1.30 is the newest there is. A host whose validator implements 2020-12
 * only then refuses the tool over the label alone - measured against this server,
 * `find_event_trips` came back as an unsupported dialect and the verb disappeared from the
 * manifest, schema body and all.
 *
 * The body is not what the two drafts disagree about. For every shape in `schemas.ts` zod
 * emits identical JSON at both targets, because none of them uses a construct the drafts
 * spell differently - no tuples, no `exclusiveMinimum`, no `$defs`. That is what makes this a
 * relabelling and not a lie, and `tests/mcp-dialect.test.ts` proves it shape by shape. The day
 * a schema leaves that subset the test goes red first, and this file has to convert instead.
 *
 * Specified in `specs/06-mcp-shlyuz.md`; the scenario is in `features/agent-tools.feature`.
 */

/** What a current host validates against. */
export const JSON_SCHEMA_DIALECT = 'https://json-schema.org/draft/2020-12/schema';

/** What the SDK stamps on everything it converts. Only this label is ever replaced. */
const SDK_DIALECT = 'http://json-schema.org/draft-07/schema#';

type Message = Record<string, unknown>;

const isRecord = (value: unknown): value is Message =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

/** The same schema under the current label, or the same object when there is nothing to do. */
function restamp(schema: unknown): unknown {
  if (!isRecord(schema) || schema['$schema'] !== SDK_DIALECT) return schema;
  return { ...schema, $schema: JSON_SCHEMA_DIALECT };
}

/**
 * An outgoing message with the tool schemas published under the dialect hosts read.
 *
 * Only `result.tools[].inputSchema` and `.outputSchema` are touched, and only when they carry
 * the label the SDK put there. Everything else - a tool answer, a request, a `$schema` a
 * source happened to include in its own payload - travels untouched.
 */
export function withCurrentDialect<T>(message: T): T {
  if (!isRecord(message)) return message;
  const result = message['result'];
  if (!isRecord(result) || !Array.isArray(result['tools'])) return message;

  const tools = result['tools'].map((tool: unknown) => {
    if (!isRecord(tool)) return tool;
    const listed: Message = { ...tool };
    if ('inputSchema' in listed) listed['inputSchema'] = restamp(listed['inputSchema']);
    if ('outputSchema' in listed) listed['outputSchema'] = restamp(listed['outputSchema']);
    return listed;
  });

  return { ...message, result: { ...result, tools } } as T;
}

/** The one method this needs from a transport, so no SDK version has to agree with us. */
type Sends = { send(message: never, options?: never): Promise<void> };

/**
 * Makes a transport publish schemas in the current dialect on its way out.
 *
 * The seam is the transport rather than the tool registration because the SDK builds the
 * manifest itself, from zod, with no target to pass in.
 */
export function speakCurrentDialect<T extends Sends>(transport: T): T {
  const send = transport.send.bind(transport);
  transport.send = (message: never, options?: never) => send(withCurrentDialect(message), options);
  return transport;
}
