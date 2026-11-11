# Scoring

Stoop grades each building from A to F based on its public record. This document describes the formula. The implementation is in [`src/background/scoring.ts`](../src/background/scoring.ts), and its tests include the worked example below.

Active construction permits aren't fetched or scored: construction is visible on a tour and common across the city. The weights, half-life and grade bands are judgment calls, not statistical estimates. They're listed in one place so they can be reviewed and adjusted.

## Formula

1. Every record adds penalty points according to its type:

   | Record                              | Points                    |
   | ----------------------------------- | ------------------------- |
   | Open HPD violation, class C         | 10                        |
   | Open HPD violation, class B         | 4                         |
   | Open HPD violation, class A         | 1                         |
   | Closed HPD violation                | 25% of its class's points |
   | HPD violation, class I              | 0                         |
   | 311 heat or pest incident           | 3                         |
   | 311 plumbing incident               | 2                         |
   | 311 building condition incident     | 1.5                       |
   | 311 noise incident                  | 0.5                       |
   | Other 311 incident                  | 0.25                      |
   | Stop-work order in force            | 15                        |
   | Unit reported infested with bedbugs | 5                         |
   | No bedbug filing on record          | 5                         |

   A 311 incident is a set of requests with the same type and descriptor on the same day (see the 311 fetcher).

2. Points decay with age, halving every 365 days:

   ```
   weight = 0.5 ^ (age in days / 365)
   ```

   Closed violations decay from their inspection date, and 311 incidents from their date. Open violations don't decay, because the problem is still unresolved. Stop-work orders and bedbug filings don't decay, because each reflects the building's current state.

3. The total is divided by the residential unit count plus a prior of 5 units, and expressed per 10 units:

   ```
   rate = total points / (residential units + 5) × 10
   ```

   The prior keeps a small building from swinging to an extreme grade because of one or two records.

4. The rate maps to a grade:

   | Grade | Rate           |
   | ----- | -------------- |
   | A     | below 1.5      |
   | B     | 1.5 to below 4 |
   | C     | 4 to below 8   |
   | D     | 8 to below 15  |
   | F     | 15 or more     |

   The 0 to 100 score shown with the grade is `100 × 0.5 ^ (rate / 6)`, so it halves every 6 points of rate.

## When a building isn't graded

| Case                                     | Result                                                 |
| ---------------------------------------- | ------------------------------------------------------ |
| HPD violations, 311 or PLUTO didn't load | Not graded: incomplete                                 |
| PLUTO has no residential unit count      | Not graded: unknown size                               |
| The lot has 0 residential units          | Not graded: no residential units                       |
| Stop-work or bedbug data didn't load     | Graded without that source, which is listed as missing |

## Worked example

A 40-unit building, scored on 2026-11-11:

| Record                                   | Calculation               | Points      |
| ---------------------------------------- | ------------------------- | ----------- |
| 1 open class C violation                 | 1 × 10                    | 10.0000     |
| 2 open class B violations                | 2 × 4                     | 8.0000      |
| 2 heat incidents, 182 days ago           | 2 × 3 × 0.5 ^ (182 / 365) | 4.2467      |
| 4 noise incidents, 365 days ago          | 4 × 0.5 × 0.5             | 1.0000      |
| 3 class A violations closed 365 days ago | 3 × 1 × 0.25 × 0.5        | 0.3750      |
| Bedbug filing reporting 0 infested units | 0                         | 0           |
| **Total**                                |                           | **23.6217** |

```
rate  = 23.6217 / (40 + 5) × 10 = 5.2493   → grade C
score = 100 × 0.5 ^ (5.2493 / 6) = 55
```
