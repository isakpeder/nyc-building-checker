/**
 * Builds SoQL queries for NYC Open Data without string concatenation.
 *
 * Values are inserted through the {@link soql} tagged template, which escapes
 * each one by type. Column names can't be escaped, so they must match a strict
 * identifier pattern. Used by the Socrata client and the dataset fetchers.
 */

/** A piece of a SoQL expression with every value already escaped. */
export interface SoqlFragment {
  readonly text: string;
}

/** A value that can be inserted into a SoQL expression. */
export type SoqlValue =
  string | number | Date | SoqlFragment | readonly string[];

/** A query against one dataset. */
export interface SoqlQuery {
  readonly select?: readonly string[];
  readonly where?: SoqlFragment;
  readonly order?: { readonly column: string; readonly descending?: boolean };
  readonly limit?: number;
  readonly offset?: number;
}

/** Matches column names: lowercase letters, digits and underscores, or :id. */
const IDENTIFIER = /^(?::id|[a-z_][a-z0-9_]*)$/;

/**
 * Checks that a column name is a plain identifier.
 *
 * @param name - The column name.
 * @returns The name, unchanged.
 * @throws Error if the name contains anything else, since that's a programmer error.
 */
export function identifier(name: string): string {
  if (!IDENTIFIER.test(name)) {
    throw new Error(`Invalid SoQL identifier: ${name}`);
  }
  return name;
}

/**
 * Escapes one value for SoQL.
 *
 * @param value - The value to insert.
 * @returns The value as SoQL text.
 * @throws Error for a non-finite number or an invalid date.
 */
function literal(value: SoqlValue): string {
  if (typeof value === 'string') {
    // SoQL escapes a single quote by doubling it.
    return `'${value.replaceAll("'", "''")}'`;
  }
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) {
      throw new Error(`Invalid SoQL number: ${String(value)}`);
    }
    return String(value);
  }
  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) {
      throw new Error('Invalid SoQL date');
    }
    // Floating timestamps have no time zone: YYYY-MM-DDTHH:MM:SS.
    return `'${value.toISOString().slice(0, 19)}'`;
  }
  if (Array.isArray(value)) {
    if (value.length === 0) {
      throw new Error('Empty SoQL list');
    }
    return `(${value.map(literal).join(', ')})`;
  }
  return (value as SoqlFragment).text;
}

/**
 * Builds a SoQL expression, escaping every inserted value.
 *
 * @param strings - The fixed parts of the template.
 * @param values - The values to escape and insert.
 * @returns The expression.
 *
 * @example
 * soql`bbl = ${"1'0"} AND created_date >= ${new Date('2024-01-01')}`;
 * // { text: "bbl = '1''0' AND created_date >= '2024-01-01T00:00:00'" }
 */
export function soql(
  strings: TemplateStringsArray,
  ...values: readonly SoqlValue[]
): SoqlFragment {
  let text = strings[0] ?? '';
  values.forEach((value, index) => {
    text += literal(value) + (strings[index + 1] ?? '');
  });
  return { text };
}

/**
 * Converts a query to URL search parameters for a /resource endpoint.
 *
 * @param query - The query.
 * @returns The parameters.
 */
export function toSearchParams(query: SoqlQuery): URLSearchParams {
  const params = new URLSearchParams();
  if (query.select !== undefined) {
    params.set('$select', query.select.map(identifier).join(','));
  }
  if (query.where !== undefined) {
    params.set('$where', query.where.text);
  }
  if (query.order !== undefined) {
    const direction = query.order.descending === true ? ' DESC' : '';
    params.set('$order', `${identifier(query.order.column)}${direction}`);
  }
  if (query.limit !== undefined) {
    params.set('$limit', String(query.limit));
  }
  if (query.offset !== undefined) {
    params.set('$offset', String(query.offset));
  }
  return params;
}
