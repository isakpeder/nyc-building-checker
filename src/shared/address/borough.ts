/**
 * Maps borough names, codes and postal city names to NYC's five boroughs.
 *
 * Part of the shared layer: pure, with no browser APIs. Used to read the borough
 * from a listing's address and to compare it with the borough a geocoder returns.
 *
 * Postal cities come from 311 service requests created June to November 2026.
 * Manhattan addresses use NEW YORK, and Queens addresses usually use the
 * neighborhood name. Floral Park, New Hyde Park and Bellerose are excluded because
 * those names also refer to towns in Nassau County, outside the city.
 */

/** One of NYC's five boroughs. */
export type Borough =
  'MANHATTAN' | 'BRONX' | 'BROOKLYN' | 'QUEENS' | 'STATEN ISLAND';

/**
 * The borough codes used by city datasets, and the first digit of a BBL or BIN.
 */
export const BOROUGH_CODES: Readonly<Record<Borough, number>> = {
  MANHATTAN: 1,
  BRONX: 2,
  BROOKLYN: 3,
  QUEENS: 4,
  'STATEN ISLAND': 5,
};

const ALIASES: Readonly<Record<Borough, readonly string[]>> = {
  MANHATTAN: ['MN', '1', 'NEW YORK', 'NEW YORK COUNTY', 'NY COUNTY'],
  BRONX: ['BX', '2', 'THE BRONX', 'BRONX COUNTY'],
  BROOKLYN: ['BK', '3', 'KINGS', 'KINGS COUNTY'],
  QUEENS: [
    'QN',
    '4',
    'QUEENS COUNTY',
    'ARVERNE',
    'ASTORIA',
    'BAYSIDE',
    'BREEZY POINT',
    'CAMBRIA HEIGHTS',
    'COLLEGE POINT',
    'CORONA',
    'EAST ELMHURST',
    'ELMHURST',
    'FAR ROCKAWAY',
    'FLUSHING',
    'FOREST HILLS',
    'FRESH MEADOWS',
    'GLEN OAKS',
    'HOLLIS',
    'HOWARD BEACH',
    'JACKSON HEIGHTS',
    'JAMAICA',
    'KEW GARDENS',
    'LITTLE NECK',
    'LONG ISLAND CITY',
    'MASPETH',
    'MIDDLE VILLAGE',
    'OAKLAND GARDENS',
    'OZONE PARK',
    'QUEENS VILLAGE',
    'REGO PARK',
    'RICHMOND HILL',
    'RIDGEWOOD',
    'ROSEDALE',
    'SAINT ALBANS',
    'SOUTH OZONE PARK',
    'SOUTH RICHMOND HILL',
    'SPRINGFIELD GARDENS',
    'SUNNYSIDE',
    'WHITESTONE',
    'WOODHAVEN',
    'WOODSIDE',
  ],
  'STATEN ISLAND': ['SI', '5', 'RICHMOND', 'RICHMOND COUNTY'],
};

/** Maps every alias and canonical name to its borough. */
const BOROUGHS_BY_NAME: ReadonlyMap<string, Borough> = new Map(
  (Object.keys(ALIASES) as Borough[]).flatMap((borough) =>
    [borough, ...ALIASES[borough]].map((name) => [name, borough] as const),
  ),
);

/**
 * Finds the borough a name, code or postal city refers to.
 *
 * @param name - A borough name, county, two-letter code, digit or postal city.
 * @returns The borough, or `null` if `name` doesn't identify exactly one.
 *
 * @example
 * parseBorough('Astoria'); // 'QUEENS'
 * parseBorough('New York'); // 'MANHATTAN'
 * parseBorough('S.I.'); // 'STATEN ISLAND'
 * parseBorough('Floral Park'); // null
 */
export function parseBorough(name: string): Borough | null {
  const key = name
    .normalize('NFKC')
    .toUpperCase()
    .replace(/\./g, '')
    .replace(/\bST\b/g, 'SAINT')
    .trim()
    .replace(/\s+/g, ' ');

  return BOROUGHS_BY_NAME.get(key) ?? null;
}
