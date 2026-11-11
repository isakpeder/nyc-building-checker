/**
 * NYC Open Data dataset IDs used by the background worker.
 *
 * Each ID was checked against data.cityofnewyork.us on 2026-11-05.
 */

export const DATASETS = {
  /** Housing Maintenance Code Violations (HPD). Keyed by BBL. */
  hpdViolations: 'wvxf-dwi5',
  /** 311 Service Requests from 2020 to Present. Keyed by BBL. */
  serviceRequests311: 'erm2-nwe9',
  /** DOB Permit Issuance, the legacy BIS system. Keyed by BIN. */
  dobPermitsLegacy: 'ipu4-2q9a',
  /** DOB NOW: Build – Approved Permits. Keyed by BIN. */
  dobPermitsNow: 'rbx6-tga4',
  /** DOB Complaints Received, the source of stop-work orders. Keyed by BIN. */
  dobComplaints: 'eabe-havv',
  /** Bedbug Reporting. Keyed by BBL. */
  bedbugs: 'wz6d-d3jb',
  /** Primary Land Use Tax Lot Output (PLUTO). Keyed by BBL. */
  pluto: '64uk-42ks',
} as const;
