import type { ComponentPropsWithRef } from 'react';
import { cx } from '../../internal/cx';

export interface FieldErrorProps extends Omit<
  ComponentPropsWithRef<'p'>,
  'id' | 'role'
> {
  /** Required so that the control can reference it with `aria-describedby`. */
  id: string;
  /** Announces the message immediately (`role="alert"`), e.g. after a submit. */
  announce?: boolean;
}

/** Validation message of a field; the text is the `children` (D17). */
export function FieldError({
  id,
  announce = false,
  className,
  children,
  ref,
  ...rest
}: FieldErrorProps) {
  return (
    <p
      ref={ref}
      id={id}
      role={announce ? 'alert' : undefined}
      className={cx('font-sans text-sm text-danger', className)}
      {...rest}
    >
      {children}
    </p>
  );
}
