import { createElement } from 'react';
import type { ComponentPropsWithoutRef, Ref } from 'react';
import { cx } from '../../internal/cx';

export type ContainerElement = 'div' | 'main' | 'section';

// Max width and horizontal padding follow the breakpoints of the token contract.
const BASE = 'mx-auto w-full max-w-screen-lg px-4 sm:px-6 lg:px-8';

export interface ContainerProps extends ComponentPropsWithoutRef<'div'> {
  /** Element to render; restricted to a generic block or a landmark. */
  as?: ContainerElement;
  ref?: Ref<HTMLElement>;
}

export function Container({
  as = 'div',
  className,
  children,
  ref,
  ...rest
}: ContainerProps) {
  return createElement(
    as,
    { ref, className: cx(BASE, className), ...rest },
    children,
  );
}
