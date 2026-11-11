/**
 * Renders the React panel into a closed shadow root on the panel's host element.
 *
 * The shadow root keeps page styles out and panel styles in. It's closed so page
 * scripts can't read the panel's contents through the host element, except in
 * end-to-end test builds.
 */

import { createRoot } from 'react-dom/client';

import type { AnalyticsEvent } from '../../shared/analytics-events';
import { Panel, type PanelView } from './Panel';
import styles from './styles.css?inline';

/** A rendered panel that can be updated or removed. */
export interface PanelRoot {
  readonly render: (view: PanelView) => void;
  readonly unmount: () => void;
}

/**
 * Attaches a shadow root with the panel's styles to a host element.
 *
 * @param host - The panel's host element, already in the page.
 * @param onEvent - Receives usage events from the panel.
 * @returns Functions to render and remove the panel.
 */
export function attachPanel(
  host: HTMLElement,
  onEvent?: (event: AnalyticsEvent) => void,
): PanelRoot {
  // End-to-end test builds use an open root so the browser tests can reach the
  // panel. Every other build keeps it closed.
  const shadow = host.attachShadow({
    mode: import.meta.env.MODE === 'e2e' ? 'open' : 'closed',
  });

  const style = document.createElement('style');
  style.textContent = styles;
  const container = document.createElement('div');
  shadow.append(style, container);

  const root = createRoot(container);
  return {
    render: (view) => {
      root.render(<Panel view={view} onEvent={onEvent} />);
    },
    unmount: () => {
      root.unmount();
    },
  };
}
