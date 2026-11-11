# Data sources

All datasets are queried through the Socrata SODA API at `https://data.cityofnewyork.us/resource/{id}.json`. Dataset IDs were checked on 2026-11-05 and are defined in `src/shared/datasets.ts`.

## NYC GeoSearch

`https://geosearch.planninglabs.nyc/v2/search`, queried with the normalized street and borough, never the unit. Returns up to 10 candidates with a BBL and BIN in `addendum.pad`.

GeoSearch reports the same confidence for correct and incorrect matches, so its confidence isn't used. A candidate is accepted when its normalized street equals the listing's, its borough matches, and its BBL starts with that borough's digit. BINs of the form `N000000` are placeholders and are treated as missing.

## HPD Housing Maintenance Code Violations: `wvxf-dwi5`

- **Query:** `bbl`, inspected in the last five years or still open.
- **Identity:** `violationid`. Repeated rows keep the latest `currentstatusdate`.
- **Classes:** A non-hazardous, B hazardous, C immediately hazardous. Class I is counted separately.
- **Notes:** `apartment` is missing for building-wide violations. `BLDG`, `ENTIRE`, `ALL` and `N/A` also mean no single unit.

## 311 Service Requests from 2020 to Present: `erm2-nwe9`

- **Query:** `bbl`, created in the last three years.
- **Identity:** `unique_key`. Requests with the same type and descriptor on the same day form one incident, and both counts are kept.
- **Categories:** heat, indoor pests, rat sightings (`Rodent`, filed with the Health Department), plumbing, building condition (other HPD and DOB requests), noise and other.

## DOB Complaints Received: `eabe-havv`

- **Query:** `bin`, with a stop-work disposition code.
- **Stop-work codes:** `A3` and `U4` full order served, `L1` and `U5` partial order, `L2` and `L3` order lifted. Codes are from DOB's BIS complaint disposition list.
- **Identity:** `complaint_number`, using its latest disposition from the last three years.
- **Notes:** dates are stored as `MM/DD/YYYY` text, so they're parsed and compared in the extension rather than in the query.

## Bedbug Reporting: `wz6d-d3jb`

- **Query:** `bbl`.
- **Identity:** the latest filing of each `building_id`, summed across the lot.
- **States:** no filing, a filing reporting zero infested units, or a filing reporting some.

## Shared rules

- Each query fetches pages of 1,000 rows ordered by `:id`, up to 5,000 rows. Counts from a capped query are shown with a `+`.
- Each row is validated with a lenient schema, so one malformed row is skipped rather than failing the page.
- No app token is used, so requests share the anonymous rate limit of the user's IP address.
