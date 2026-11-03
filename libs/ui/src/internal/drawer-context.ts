import { createContext, useContext } from 'react';

export interface DrawerContextValue {
  /** Closes the drawer of the `AppShell`; a no-op outside of it. */
  closeDrawer: () => void;
}

const INERT: DrawerContextValue = { closeDrawer: () => undefined };

/**
 * Internal (not exported by the package). The `AppShell` provides it only
 * around the content of its drawer, so a `SideNav` rendered anywhere else
 * gets the inert default.
 */
export const DrawerContext = createContext<DrawerContextValue>(INERT);

export function useDrawer(): DrawerContextValue {
  return useContext(DrawerContext);
}
