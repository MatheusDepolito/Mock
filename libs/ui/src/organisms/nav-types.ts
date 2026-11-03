import type { ReactNode } from 'react';
import type { IconComponent } from '../atoms/Icon';

/** One navigation entry. The library holds no concrete navigation data. */
export interface NavItem {
  id: string;
  /** Visible text; it comes from the consumer (D17). */
  label: string;
  href: string;
  icon?: IconComponent;
  /** Marks the entry of the current page (`aria-current="page"`). */
  current?: boolean;
}

export interface NavLinkProps {
  href: string;
  className: string;
  'aria-current'?: 'page';
  children: ReactNode;
}

/**
 * Renders a navigation link. The default is a plain `<a>`; the consumer can
 * plug its router link here, so the library never imports a framework.
 */
export type RenderLink = (props: NavLinkProps) => ReactNode;
