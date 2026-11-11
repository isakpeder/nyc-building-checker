# Chrome Web Store listing

Material for the Chrome Web Store submission form.

## Single purpose

Shows NYC public building records (housing violations, 311 complaints, stop-work orders and bedbug filings) for the StreetEasy listing being viewed.

## Permissions

| Permission                                   | Justification                                                                                                                      |
| -------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| `storage`                                    | Caches building reports for a day so revisits load quickly, stores the random analytics install ID, and syncs the user's settings. |
| Content script on `https://streeteasy.com/*` | Reads the address of the listing being viewed and shows the building record panel on that page. It doesn't run on any other site.  |

The extension requests no host permissions. NYC GeoSearch, NYC Open Data and PostHog accept cross-origin requests, so the background worker can reach them without extra permissions.

## Remote code

No. All code is bundled in the package.

## Data usage disclosure

Suggested answers, based on [PRIVACY.md](PRIVACY.md):

| Category                            | Collected                  | Notes                                                                                          |
| ----------------------------------- | -------------------------- | ---------------------------------------------------------------------------------------------- |
| Personally identifiable information | No                         |                                                                                                |
| Health information                  | No                         |                                                                                                |
| Financial and payment information   | No                         |                                                                                                |
| Authentication information          | No                         |                                                                                                |
| Personal communications             | No                         |                                                                                                |
| Location                            | No                         | No geolocation. Analytics events disable IP-based location lookup.                             |
| Web history                         | No                         | Listing URLs are never sent.                                                                   |
| User activity                       | Yes, if usage stats are on | Anonymous feature usage events, such as opening details. Can be turned off in the popup.       |
| Website content                     | Yes                        | The listing's street and borough are sent to NYC's public APIs to find the building's records. |

Certifications:

- Data isn't sold to third parties.
- Data isn't used or transferred for purposes unrelated to the extension's single purpose.
- Data isn't used to determine creditworthiness or for lending.

## Privacy policy URL

Use the published `docs/PRIVACY.md`, for example its GitHub page.
