/**
 * Types for the build-time environment variables the extension reads. Both are
 * optional; leaving them unset turns the related feature off.
 */

interface ImportMetaEnv {
  /** PostHog project key. Analytics sends nothing without it. */
  readonly VITE_POSTHOG_KEY?: string;
  /** Feedback form opened on uninstall. Must start with https://. */
  readonly VITE_UNINSTALL_FORM_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
