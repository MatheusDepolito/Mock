import type { ComponentPropsWithRef } from 'react';
import { cx } from '../../internal/cx';

export interface SpinnerProps extends Omit<
  ComponentPropsWithRef<'span'>,
  'children' | 'role'
> {
  /** Text announced by assistive technology; it comes from the consumer (D17). */
  label: string;
}

/** Loading indicator: a `status` region whose text is the `label` prop. */
export function Spinner({ label, className, ref, ...rest }: SpinnerProps) {
  return (
    <span
      ref={ref}
      role="status"
      className={cx('inline-flex items-center', className)}
      {...rest}
    >
      <svg
        aria-hidden="true"
        viewBox="0 0 24 24"
        fill="none"
        className="h-5 w-5 animate-spin"
      >
        <circle
          cx="12"
          cy="12"
          r="10"
          stroke="currentColor"
          strokeWidth="4"
          className="opacity-25"
        />
        <path
          d="M4 12a8 8 0 018-8"
          stroke="currentColor"
          strokeWidth="4"
          strokeLinecap="round"
        />
      </svg>
      <span className="sr-only">{label}</span>
    </span>
  );
}
