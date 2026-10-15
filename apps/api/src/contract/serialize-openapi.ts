/**
 * Canonical, byte-stable serialization of an OpenAPI document (ADR 009, D4):
 *
 * - keys of EVERY object sorted by Unicode code point;
 * - arrays keep their order (it carries meaning: `required`, `enum`,
 *   `tags`, `parameters`);
 * - 2-space indentation, a single trailing `\n`, no `\r`, no BOM.
 *
 * Pure: no filesystem access. Writing the result (and the UTF-8 encoding
 * without BOM) is the job of the CLI; a read-only check can reuse this as is.
 */
export function serializeOpenApi(document: unknown): string {
  // Round-trip through JSON first: drops `undefined`, resolves `toJSON`, and
  // guarantees only plain JSON values reach the canonicalization below.
  const plain: unknown = JSON.parse(JSON.stringify(document));
  return `${JSON.stringify(canonicalize(plain), null, 2)}\n`;
}

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(canonicalize);
  }

  if (value !== null && typeof value === 'object') {
    const source = value as Record<string, unknown>;
    const sorted: Record<string, unknown> = {};
    for (const key of Object.keys(source).sort(compareByCodePoint)) {
      sorted[key] = canonicalize(source[key]);
    }
    return sorted;
  }

  return value;
}

/**
 * Orders strings by Unicode code point. The default `Array.prototype.sort`
 * compares UTF-16 code units, which orders astral characters (surrogate
 * pairs) before U+E000..U+FFFF.
 */
function compareByCodePoint(a: string, b: string): number {
  const left = Array.from(a);
  const right = Array.from(b);
  const length = Math.min(left.length, right.length);

  for (let index = 0; index < length; index += 1) {
    const difference =
      (left[index] as string).codePointAt(0)! -
      (right[index] as string).codePointAt(0)!;
    if (difference !== 0) {
      return difference;
    }
  }

  return left.length - right.length;
}
