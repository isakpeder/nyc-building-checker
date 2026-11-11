# Architecture

Stoop is a Manifest V3 Chrome extension with no backend. It has three parts, which communicate only through typed messages.

| Part                                         | Runs                                             | Responsibilities                                             |
| -------------------------------------------- | ------------------------------------------------ | ------------------------------------------------------------ |
| Content script (`src/content`)               | In StreetEasy tabs, in an isolated world         | Detects listing pages, reads the address, renders the panel  |
| Background service worker (`src/background`) | In the extension's background, stopped when idle | Geocodes, queries city data, caches reports, sends analytics |
| Popup (`src/popup`)                          | While the toolbar popup is open                  | Edits settings and clears saved reports                      |

Code in `src/shared` has no browser APIs except the small adapters for storage and messaging, and is used by all three parts.

## How a report is built

1. **Detect.** `classifyPage` classifies the URL. Only listing pages continue. `watchUrl` notices in-page navigation, and the controller abandons a run when a newer URL arrives.
2. **Extract.** `extractListingAddress` reads `ItemPage.mainEntity.address` from the page's JSON-LD and falls back to the `data-testid="address"` heading. If the two disagree, the heading wins, since JSON-LD can describe the previous listing after in-page navigation.
3. **Normalize.** Street, unit and borough are normalized to canonical, idempotent forms (`src/shared/address`).
4. **Request.** The content script sends a `get-report` message. The worker validates it with Zod and normalizes the address again.
5. **Check the city.** An address with no borough and a state other than NY is reported as outside New York City, without any network request.
6. **Geocode.** GeoSearch returns candidates. One is accepted only if its normalized street, borough and BBL borough digit match the listing, and only one building matches.
7. **Fetch.** HPD violations, 311 complaints, stop-work orders and bedbug filings are fetched in parallel with `Promise.allSettled`. A failed source marks only its own section unavailable.
8. **Cache.** Complete reports are stored in `chrome.storage.local` for a day under a versioned key, and concurrent requests for one building share a build.
9. **Render.** React renders the panel in a closed shadow root. Details open in a modal dialog so the page layout never changes.

## Reliability

- Every HTTP request has a timeout and retries timeouts, network errors, 429 and 5xx responses with exponential backoff, full jitter and `Retry-After`.
- At most three NYC Open Data requests run at once.
- Expected failures are values of `Result<T, E>`. Exceptions are reserved for programmer errors.
- SoQL values are escaped by a tagged template, and column names must match an identifier pattern.

## Testing

- Unit and component tests with Vitest, jsdom, Testing Library and MSW for HTTP.
- End-to-end tests with Playwright load the built extension (`--mode e2e`, which opens the shadow root) on a synthetic listing page with every request mocked.
- CI runs formatting, lint, typecheck, unit tests with coverage, the build and the end-to-end tests on every pull request.
