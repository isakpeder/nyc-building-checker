# Privacy

Stoop works on the page you're viewing and sends as little as possible.

## What Stoop reads

On `streeteasy.com` listing pages, the content script reads the listing's address from the page's structured data or address heading. It doesn't read other pages, prefetch listings or run on other sites.

## What leaves your browser

| Data                                               | Sent to                                      | Why                                           |
| -------------------------------------------------- | -------------------------------------------- | --------------------------------------------- |
| The listing's street and borough, without the unit | NYC GeoSearch (`geosearch.planninglabs.nyc`) | To find the building's city IDs               |
| The building's BBL or BIN                          | NYC Open Data (`data.cityofnewyork.us`)      | To fetch its public records                   |
| Anonymous usage events, if enabled                 | PostHog (`us.i.posthog.com`)                 | To count installs and which features are used |

Like any web request, these reach the receiving servers from your IP address. Listing URLs, prices, descriptions, photos and anything you type are never sent anywhere.

Listings outside New York City are detected in the browser, and nothing about them is sent.

## Anonymous usage events

Usage events are sent only when the build includes an analytics key and **Share anonymous usage stats** is on in the popup. It's on by default and can be turned off at any time. Each event carries a random install ID created with `crypto.randomUUID()`, which isn't linked to your Google account or any personal information. Events are sent without a person profile and with location lookup disabled.

The complete list of events, enforced by a strict schema in `src/shared/analytics-events.ts`:

| Event                 | Properties                                                                                                                |
| --------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| `extension_installed` | none                                                                                                                      |
| `extension_updated`   | none                                                                                                                      |
| `panel_shown`         | outcome (`report`, `outside-nyc`, `building-not-found`, `unavailable`, `invalid-request`), number of unavailable sections |
| `details_opened`      | none                                                                                                                      |
| `source_link_clicked` | which section's source (`violations`, `complaints`, `stopWork` or `bedbugs`)                                              |
| `settings_changed`    | the new values of the two settings                                                                                        |
| `cache_cleared`       | none                                                                                                                      |

Every event also includes the extension version.

## What's stored on your device

| Data              | Where                  | How long                                      |
| ----------------- | ---------------------- | --------------------------------------------- |
| Building reports  | `chrome.storage.local` | One day, at most 50, clearable from the popup |
| Random install ID | `chrome.storage.local` | Until the extension is removed                |
| Settings          | `chrome.storage.sync`  | Until changed                                 |

## Uninstall feedback

If the build includes a feedback form address, Chrome opens that form when the extension is uninstalled. Filling it in is optional.

## Code

The extension loads no remote code. Everything it runs is bundled in the package.
