import { IconMenu2 } from '@tabler/icons-react';
import type { ComponentPropsWithRef, ReactNode } from 'react';
import { Icon } from '../../atoms/Icon';
import { cx } from '../../internal/cx';

/** Props of the optional menu button; the label is required with the handler. */
export interface AppHeaderMenuProps {
  onMenuClick: () => void;
  /** Accessible name of the menu button; it comes from the consumer (D17). */
  menuLabel: string;
  menuExpanded?: boolean;
  menuControls?: string;
}

type MenuProps =
  | AppHeaderMenuProps
  | {
      onMenuClick?: undefined;
      menuLabel?: undefined;
      menuExpanded?: undefined;
      menuControls?: undefined;
    };

export type AppHeaderProps = Omit<
  ComponentPropsWithRef<'header'>,
  'children'
> & {
  /** Brand area (logo, name); a node, the library knows no brand. */
  brand: ReactNode;
  /** Actions area, aligned to the end. */
  children?: ReactNode;
} & MenuProps;

/** Application header. The menu button only exists below the `lg` breakpoint. */
export function AppHeader({
  brand,
  children,
  onMenuClick,
  menuLabel,
  menuExpanded,
  menuControls,
  className,
  ref,
  ...rest
}: AppHeaderProps) {
  return (
    <header
      ref={ref}
      className={cx(
        'flex h-14 items-center gap-3 border-b border-border bg-surface-raised px-4 font-sans text-content',
        className,
      )}
      {...rest}
    >
      {onMenuClick !== undefined ? (
        <button
          type="button"
          aria-label={menuLabel}
          {...(menuExpanded !== undefined
            ? { 'aria-expanded': menuExpanded }
            : {})}
          {...(menuControls !== undefined
            ? { 'aria-controls': menuControls }
            : {})}
          onClick={() => onMenuClick()}
          className="rounded-md p-2 text-content hover:bg-surface focus-visible:outline-2 focus-visible:outline-primary lg:hidden"
        >
          <Icon icon={IconMenu2} size="md" />
        </button>
      ) : null}
      <div className="flex min-w-0 flex-1 items-center">{brand}</div>
      {children !== undefined ? (
        <div className="flex items-center gap-2">{children}</div>
      ) : null}
    </header>
  );
}
