import type { ComponentPropsWithRef } from 'react';
import { cx } from '../../internal/cx';

export type TextInputType =
  'text' | 'email' | 'password' | 'search' | 'tel' | 'url' | 'number';

// The border carries the boundary of the control (non-text contrast >= 3:1),
// so it uses `content-muted`, not the decorative `border` token.
const BASE =
  'block w-full rounded-md border bg-surface-raised px-3 py-2 font-sans text-base text-content placeholder:text-content-muted focus-visible:outline-2 disabled:cursor-not-allowed disabled:opacity-50';

// Closed map of complete class strings (see Button).
const STATES = {
  valid: 'border-content-muted focus-visible:outline-primary',
  invalid: 'border-danger focus-visible:outline-danger',
} as const;

export interface TextInputProps extends Omit<
  ComponentPropsWithRef<'input'>,
  'type'
> {
  type?: TextInputType;
  /** Marks the value as invalid: sets `aria-invalid` and the error style. */
  invalid?: boolean;
}

export function TextInput({
  type = 'text',
  invalid = false,
  'aria-invalid': ariaInvalid,
  className,
  ref,
  ...rest
}: TextInputProps) {
  const isInvalid = invalid || ariaInvalid === true || ariaInvalid === 'true';
  return (
    <input
      ref={ref}
      type={type}
      aria-invalid={isInvalid ? true : ariaInvalid}
      className={cx(BASE, isInvalid ? STATES.invalid : STATES.valid, className)}
      {...rest}
    />
  );
}
