/**
 * Names the extension uses to identify itself.
 *
 * Lives in the shared layer, which holds code with no browser APIs that any part
 * of the extension can import. Nothing imports these yet. The manifest and the
 * popup will, so each name is defined in exactly one place.
 */

/** Full display name, used for the manifest name and the store listing. */
export const EXTENSION_NAME = 'Stoop: NYC Building Checker';

/** Short name, used for the manifest short_name, popup header and panel branding. */
export const EXTENSION_SHORT_NAME = 'Stoop';
