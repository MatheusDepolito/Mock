import { useCallback, useSyncExternalStore } from 'react';

/**
 * The `lg` breakpoint, in one place. It must equal `--breakpoint-lg` of
 * `styles/tokens.css`; a test compares both so they cannot diverge.
 */
export const BREAKPOINT_LG = '64rem';

/** Media query that matches from the `lg` breakpoint up. */
export const DESKTOP_QUERY = `(min-width: ${BREAKPOINT_LG})`;

const supportsMatchMedia = (): boolean =>
  typeof window !== 'undefined' && typeof window.matchMedia === 'function';

/**
 * Whether the media query currently matches. Without `window.matchMedia`
 * (server render, jsdom) it is `false` and nothing is subscribed.
 *
 * This is the only use of `matchMedia` in the library: the `AppShell` closes
 * its drawer when the viewport crosses `lg`.
 */
export function useMediaQuery(query: string): boolean {
  const subscribe = useCallback(
    (onChange: () => void) => {
      if (!supportsMatchMedia()) return () => undefined;
      const list = window.matchMedia(query);
      list.addEventListener('change', onChange);
      return () => list.removeEventListener('change', onChange);
    },
    [query],
  );
  const getSnapshot = () =>
    supportsMatchMedia() && window.matchMedia(query).matches;
  return useSyncExternalStore(subscribe, getSnapshot, () => false);
}
