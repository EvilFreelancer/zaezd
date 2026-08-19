/**
 * Forgiving on the way in, strict on the way out.
 *
 * Measured, not guessed: in three live runs of one request, an agent sent every array argument
 * as a JSON string. The parameter is declared an array and arrives as `"[\"ai\"]"`. A server
 * built on pydantic with `extra=forbid` rejects that outright, and the traveller sees a
 * validation trace instead of a trip.
 *
 * So the boundary accepts what agents actually send, normalises it once, and hands the rest of
 * the code a single shape. Ten lines here remove a whole class of failure, including the one
 * Tutu's own server falls over on.
 *
 * Reference in `specs/06-mcp-shlyuz.md` and `specs/10-proverka.md`.
 */

/**
 * A list argument in any of the three shapes agents send it in: a real array, a JSON string of
 * one, or a comma-separated string. All three describe the same request and must produce the
 * same cache key, or the same question gets asked upstream twice.
 */
export function toList(value: unknown): readonly string[] {
  if (value === undefined || value === null) return [];

  if (Array.isArray(value)) {
    return value.flatMap((item) => toList(item));
  }

  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (trimmed === '') return [];

    if (trimmed.startsWith('[')) {
      try {
        const parsed: unknown = JSON.parse(trimmed);
        if (Array.isArray(parsed)) return toList(parsed);
      } catch {
        // Not JSON after all. Fall through and read it as a comma-separated list, which is
        // what "[ai, data" most likely meant.
      }
    }

    // A half-serialised list ("[ai, data") is read as a plain one, brackets and stray quotes
    // stripped. Left in, the first item would come back as "[ai" and match nothing upstream.
    return trimmed
      .replace(/^\[/, '')
      .replace(/\]$/, '')
      .split(',')
      .map((item) => item.trim().replace(/^["']|["']$/g, ''))
      .filter((item) => item !== '');
  }

  if (typeof value === 'number' || typeof value === 'boolean') return [String(value)];

  return [];
}

/** A number that may have arrived as a string, because that is also what agents send. */
export function toNumber(value: unknown): number | undefined {
  if (typeof value === 'number') return Number.isFinite(value) ? value : undefined;

  if (typeof value === 'string') {
    const trimmed = value.trim().replace(/[\s  ]/gu, '').replace(',', '.');
    if (trimmed === '') return undefined;
    const parsed = Number(trimmed);
    return Number.isFinite(parsed) ? parsed : undefined;
  }

  return undefined;
}

/** A string that may have arrived as a number, and an empty one that means "not given". */
export function toText(value: unknown): string | undefined {
  if (typeof value === 'string') {
    const trimmed = value.trim();
    return trimmed === '' ? undefined : trimmed;
  }
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  return undefined;
}

/** A call with no arguments at all is an empty object, not a failure. */
export function toArguments(value: unknown): Readonly<Record<string, unknown>> {
  if (value === undefined || value === null) return {};

  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (trimmed === '') return {};
    try {
      const parsed: unknown = JSON.parse(trimmed);
      if (typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed)) {
        return parsed as Record<string, unknown>;
      }
    } catch {
      return {};
    }
    return {};
  }

  if (typeof value === 'object' && !Array.isArray(value)) return value as Record<string, unknown>;

  return {};
}

/**
 * The canonical form of a request, and the thing a cache key is built from.
 *
 * Lists are sorted and de-duplicated because they are sets to every source we talk to: cities
 * and topics are joined with "or", and asking for `["ai","data"]` is the same question as
 * asking for `["data","ai"]`. Ordered arguments would need their own normaliser, and there are
 * none.
 */
export function canonicalList(value: unknown): readonly string[] {
  return [...new Set(toList(value).map((item) => item.trim().toLowerCase()))].sort();
}
