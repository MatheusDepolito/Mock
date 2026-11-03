import { useId, useRef, useState } from 'react';
import type {
  ComponentPropsWithRef,
  MouseEvent,
  ReactElement,
  ReactNode,
} from 'react';
import { cx } from '../../internal/cx';
import type { AppHeaderMenuProps } from '../../organisms/AppHeader';
import { AppShellDrawer } from './AppShellDrawer';

interface ShellBaseProps extends Omit<
  ComponentPropsWithRef<'div'>,
  'children'
> {
  /** Text of the "skip to content" link; it comes from the consumer (D17). */
  skipLinkLabel: string;
  /** Page content, rendered inside `<main>`. */
  children?: ReactNode;
}

/** With a sidebar: the labels are required and the header gets the menu props. */
interface ShellWithSidebar {
  /** Usually a `SideNav`. Fixed at `lg` and above, a drawer below it. */
  sidebar: ReactElement;
  /** Names the menu button and the drawer dialog. */
  menuLabel: string;
  /** Names the close button of the drawer. */
  closeLabel: string;
  /** Render prop: spread the received menu props on the `AppHeader`. */
  header: (menu: AppHeaderMenuProps) => ReactNode;
}

interface ShellWithoutSidebar {
  sidebar?: undefined;
  menuLabel?: undefined;
  closeLabel?: undefined;
  header: ReactNode;
}

export type AppShellProps = ShellBaseProps &
  (ShellWithSidebar | ShellWithoutSidebar);

/**
 * Generic application shell: skip link, header, optional sidebar (fixed at
 * `lg`, drawer below) and `<main>`. It knows no persona, session or route.
 *
 * Landmarks: the fixed sidebar is only in the DOM while the drawer is closed
 * (below `lg` it is hidden by CSS anyway, and the drawer only opens there), so
 * there is never more than one `navigation` in the DOM; no viewport logic in JS.
 */
export function AppShell(props: AppShellProps) {
  const { skipLinkLabel, children, className, ref } = props;
  const [drawerOpen, setDrawerOpen] = useState(false);
  const mainRef = useRef<HTMLElement>(null);
  const baseId = useId();
  const mainId = `${baseId}-main`;
  const drawerId = `${baseId}-drawer`;

  const focusMain = (event: MouseEvent<HTMLAnchorElement>) => {
    event.preventDefault();
    mainRef.current?.focus();
  };

  let header: ReactNode;
  let sidebar: ReactNode = null;
  let drawer: ReactNode = null;
  if (props.sidebar !== undefined) {
    header = props.header({
      onMenuClick: () => setDrawerOpen(true),
      menuLabel: props.menuLabel,
      menuExpanded: drawerOpen,
      menuControls: drawerId,
    });
    if (!drawerOpen) {
      sidebar = (
        <div className="hidden w-64 shrink-0 border-r border-border bg-surface-raised lg:block">
          {props.sidebar}
        </div>
      );
    }
    drawer = (
      <AppShellDrawer
        id={drawerId}
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        label={props.menuLabel}
        closeLabel={props.closeLabel}
      >
        {props.sidebar}
      </AppShellDrawer>
    );
  } else {
    header = props.header;
  }

  return (
    <div
      ref={ref}
      className={cx(
        'flex min-h-screen flex-col bg-surface font-sans text-content',
        className,
      )}
    >
      <a
        href={`#${mainId}`}
        onClick={focusMain}
        className="sr-only focus:not-sr-only focus:absolute focus:left-2 focus:top-2 focus:z-50 focus:rounded-md focus:bg-surface-raised focus:px-3 focus:py-2 focus:text-content focus-visible:outline-2 focus-visible:outline-primary"
      >
        {skipLinkLabel}
      </a>
      {header}
      <div className="flex flex-1">
        {sidebar}
        <main
          id={mainId}
          ref={mainRef}
          tabIndex={-1}
          className="min-w-0 flex-1"
        >
          {children}
        </main>
      </div>
      {drawer}
    </div>
  );
}
