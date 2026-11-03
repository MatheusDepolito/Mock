import type { ComponentPropsWithRef, MouseEvent } from 'react';
import { Icon } from '../../atoms/Icon';
import { cx } from '../../internal/cx';
import { useDrawer } from '../../internal/drawer-context';
import type { NavItem, NavLinkProps, RenderLink } from '../nav-types';

// Closed maps of complete class strings (see Button). The current item is
// told apart by colour (`primary` on `surface`) and by weight.
const LINK =
  'flex items-center gap-3 rounded-md px-3 py-2 text-base hover:bg-surface focus-visible:outline-2 focus-visible:outline-primary';
const STATES = {
  current: 'bg-surface font-medium text-primary',
  idle: 'text-content',
} as const;

const defaultRenderLink: RenderLink = ({
  children,
  ...props
}: NavLinkProps) => <a {...props}>{children}</a>;

export interface SideNavProps extends Omit<
  ComponentPropsWithRef<'nav'>,
  'children'
> {
  /** Accessible name of the navigation landmark; it comes from the consumer (D17). */
  label: string;
  items: ReadonlyArray<NavItem>;
  /** Plug a router link here; the default is a plain `<a>`. */
  renderLink?: RenderLink;
}

export function SideNav({
  label,
  items,
  renderLink = defaultRenderLink,
  className,
  ref,
  ...rest
}: SideNavProps) {
  const { closeDrawer } = useDrawer();
  // Following a link closes the `AppShell` drawer (a no-op elsewhere). Clicks
  // that open a new tab or window (modifier keys, other buttons) keep it open.
  const handleClick = (event: MouseEvent<HTMLElement>) => {
    if (
      event.button !== 0 ||
      event.ctrlKey ||
      event.metaKey ||
      event.shiftKey ||
      event.altKey
    ) {
      return;
    }
    closeDrawer();
  };

  return (
    <nav
      ref={ref}
      aria-label={label}
      className={cx('font-sans', className)}
      {...rest}
    >
      <ul className="flex flex-col gap-1 p-3">
        {items.map((item) => (
          <li key={item.id}>
            {renderLink({
              href: item.href,
              className: cx(LINK, item.current ? STATES.current : STATES.idle),
              onClick: handleClick,
              ...(item.current ? { 'aria-current': 'page' as const } : {}),
              children: (
                <>
                  {item.icon !== undefined ? (
                    <Icon icon={item.icon} size="md" />
                  ) : null}
                  <span>{item.label}</span>
                </>
              ),
            })}
          </li>
        ))}
      </ul>
    </nav>
  );
}
