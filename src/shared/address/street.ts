/**
 * Normalizes NYC street addresses to one canonical, idempotent form.
 *
 * Part of the shared layer: pure, with no browser APIs. Used to compare an address
 * from a listing with an address from a geocoder, and to give different spellings
 * of one address the same key.
 *
 * Canonical form:
 * - Uppercase, single-spaced, with no periods, commas or apostrophes
 * - House numbers kept as written, including Queens hyphens: 31-10
 * - Street types and directionals spelled out: W 42nd St -> WEST 42 STREET
 * - Numbered streets as digits: 42nd -> 42, Fifth Avenue -> 5 AVENUE
 * - Leading abbreviations spelled out: St Marks Pl -> SAINT MARKS PLACE
 *
 * Input is a street line only. Units, boroughs and ZIP codes are handled separately.
 * Street aliases such as Avenue of the Americas and 6 Avenue are not merged.
 */

/**
 * Street types and their abbreviations, from USPS Publication 28 Appendix C1.
 */
const STREET_TYPE_VARIANTS: Readonly<Record<string, readonly string[]>> = {
  ALLEY: ['ALY'],
  AVENUE: ['AVE', 'AV', 'AVEN', 'AVENU', 'AVN', 'AVNUE'],
  BOULEVARD: ['BLVD', 'BOUL', 'BOULV'],
  CIRCLE: ['CIR', 'CIRC'],
  COURT: ['CT'],
  CRESCENT: ['CRES'],
  DRIVE: ['DR', 'DRV'],
  EXPRESSWAY: ['EXPY', 'EXPWY', 'EXPW'],
  HIGHWAY: ['HWY'],
  LANE: ['LN'],
  LOOP: [],
  OVAL: ['OVL'],
  PARKWAY: ['PKWY', 'PKY'],
  PLACE: ['PL'],
  PLAZA: ['PLZ', 'PLZA'],
  ROAD: ['RD'],
  ROW: [],
  SQUARE: ['SQ'],
  STREET: ['ST', 'STR'],
  TERRACE: ['TER', 'TERR'],
  TURNPIKE: ['TPKE'],
  WALK: [],
};

/** Maps every street type spelling, including the full word, to the full word. */
const STREET_TYPES: ReadonlyMap<string, string> = new Map(
  Object.entries(STREET_TYPE_VARIANTS).flatMap(([type, variants]) =>
    [type, ...variants].map((spelling) => [spelling, type] as const),
  ),
);

const DIRECTIONALS: ReadonlyMap<string, string> = new Map([
  ['N', 'NORTH'],
  ['S', 'SOUTH'],
  ['E', 'EAST'],
  ['W', 'WEST'],
]);

/** Abbreviations that mean a name, not a street type, when they start a street name. */
const NAME_PREFIXES: ReadonlyMap<string, string> = new Map([
  ['ST', 'SAINT'],
  ['DR', 'DOCTOR'],
  ['FT', 'FORT'],
  ['MT', 'MOUNT'],
]);

const ORDINAL_WORDS: ReadonlyMap<string, string> = new Map([
  ['FIRST', '1'],
  ['SECOND', '2'],
  ['THIRD', '3'],
  ['FOURTH', '4'],
  ['FIFTH', '5'],
  ['SIXTH', '6'],
  ['SEVENTH', '7'],
  ['EIGHTH', '8'],
  ['NINTH', '9'],
  ['TENTH', '10'],
  ['ELEVENTH', '11'],
  ['TWELFTH', '12'],
]);

/** Matches 350, 31-10 and 123A, and not an ordinal such as 42ND. */
const HOUSE_NUMBER = /^\d+(?:-\d+)?[A-Z]?$/;

/** Matches a numeric ordinal such as 42ND, capturing the digits. */
const NUMERIC_ORDINAL = /^(\d+)(?:ST|ND|RD|TH)$/;

/**
 * Normalizes a street address to its canonical form.
 *
 * Applying this to its own output returns the same string.
 *
 * @param address - A street line with no unit, borough or ZIP code.
 * @returns The canonical address, or an empty string if `address` has no text.
 *
 * @example
 * normalizeStreetAddress('350 W. 42nd St.'); // '350 WEST 42 STREET'
 * normalizeStreetAddress('31 - 10 37th Ave'); // '31-10 37 AVENUE'
 * normalizeStreetAddress('10 St. Mark\'s Pl'); // '10 SAINT MARKS PLACE'
 * normalizeStreetAddress('100 Avenue E'); // '100 AVENUE E'
 */
export function normalizeStreetAddress(address: string): string {
  const tokens = tokenize(address);
  const [first] = tokens;

  if (first === undefined) {
    return '';
  }

  if (HOUSE_NUMBER.test(first)) {
    return [first, ...normalizeStreetName(tokens.slice(1))].join(' ');
  }

  return normalizeStreetName(tokens).join(' ');
}

/**
 * Uppercases an address, removes punctuation and splits it into words.
 *
 * @param address - The raw address.
 * @returns The address's words.
 */
function tokenize(address: string): string[] {
  return (
    address
      .normalize('NFKC')
      .toUpperCase()
      // Removed without a space: MARK'S -> MARKS.
      .replace(/['’]/g, '')
      // Replaced with a space: W.42ND -> W 42ND.
      .replace(/[.,]/g, ' ')
      // Rejoins hyphenated house numbers: 31 - 10 -> 31-10.
      .replace(/(\d)\s*-\s*(\d)/g, '$1-$2')
      .split(/\s+/)
      .filter(Boolean)
  );
}

/**
 * Normalizes the words of a street name, which depend on their position.
 *
 * @param tokens - The address's words, excluding any house number.
 * @returns The normalized words.
 */
function normalizeStreetName(tokens: readonly string[]): string[] {
  const lastIndex = tokens.length - 1;
  const [first] = tokens;
  const hasPrefixDirectional =
    first !== undefined && DIRECTIONALS.has(first) && tokens.length > 1;
  // The index where the name starts, after any directional: W [ST MARKS PL].
  const nameStart = hasPrefixDirectional ? 1 : 0;
  const startsWithAvenue =
    STREET_TYPES.get(tokens[nameStart] ?? '') === 'AVENUE';

  return tokens.map((token, index) => {
    const directional = DIRECTIONALS.get(token);
    if (directional !== undefined && tokens.length > 1) {
      // AVENUE E is a street name. PARK AVENUE E ends in a directional.
      const isAvenueLetter = startsWithAvenue && index === nameStart + 1;
      const isSuffix = index === lastIndex && !isAvenueLetter;
      return index === 0 || isSuffix ? directional : token;
    }

    const prefix = NAME_PREFIXES.get(token);
    if (prefix !== undefined && index === nameStart && index < lastIndex) {
      return prefix;
    }

    const nextToken = tokens[index + 1];
    const ordinal = ORDINAL_WORDS.get(token);
    if (
      ordinal !== undefined &&
      nextToken !== undefined &&
      STREET_TYPES.has(nextToken)
    ) {
      return ordinal;
    }

    const numericOrdinal = NUMERIC_ORDINAL.exec(token);
    if (numericOrdinal?.[1] !== undefined) {
      return numericOrdinal[1];
    }

    return STREET_TYPES.get(token) ?? token;
  });
}
