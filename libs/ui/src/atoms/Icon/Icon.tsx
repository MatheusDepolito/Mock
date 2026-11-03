import type { AriaRole, ComponentType } from 'react';
import { cx } from '../../internal/cx';

/**
 * Any icon component that accepts these props, such as the ones of
 * `@tabler/icons-react`. The library never imports the icon catalog: the
 * consumer passes the icon it wants.
 */
export type IconComponent = ComponentType<{
  className?: string;
  role?: AriaRole;
  'aria-hidden'?: boolean | 'true' | 'false';
  'aria-label'?: string;
}>;

export type IconSize = 'sm' | 'md' | 'lg';

// Closed map of complete class strings (see Button).
const SIZES: Record<IconSize, string> = {
  sm: 'h-4 w-4 shrink-0',
  md: 'h-5 w-5 shrink-0',
  lg: 'h-6 w-6 shrink-0',
};

export interface IconProps {
  icon: IconComponent;
  size?: IconSize;
  /** Makes the icon meaningful (`role="img"`); without it the icon is decorative. */
  label?: string;
  className?: string;
}

export function Icon({
  icon: Component,
  size = 'md',
  label,
  className,
}: IconProps) {
  const classes = cx(SIZES[size], className);
  return label === undefined ? (
    <Component className={classes} aria-hidden="true" />
  ) : (
    <Component className={classes} role="img" aria-label={label} />
  );
}
