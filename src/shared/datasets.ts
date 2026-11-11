/**
 * NYC Open Data dataset IDs. Used by the background worker's fetchers and by the
 * panel's source links.
 *
 * Each ID was checked against data.cityofnewyork.us on 2026-11-05.
 */

export const DATASETS = {
  /** Housing Maintenance Code Violations (HPD). Keyed by BBL. */
  hpdViolations: 'wvxf-dwi5',
  /** 311 Service Requests from 2020 to Present. Keyed by BBL. */
  serviceRequests311: 'erm2-nwe9',
  /** DOB Complaints Received, the source of stop-work orders. Keyed by BIN. */
  dobComplaints: 'eabe-havv',
  /** Bedbug Reporting. Keyed by BBL. */
  bedbugs: 'wz6d-d3jb',
} as const;
