import type { ComponentPropsWithRef } from 'react';
import { cx } from '../../internal/cx';
import { Spinner } from '../Spinner';

export type ButtonVariant = 'primary' | 'secondary' | 'danger';
export type ButtonSize = 'sm' | 'md';

// Closed maps of complete class strings: Tailwind only generates classes it
// can read literally in the source (never build them by interpolation).
const BASE =
  'inline-flex items-center justify-center gap-2 rounded-md font-sans font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 disabled:cursor-not-allowed disabled:opacity-50';

const VARIANTS: Record<ButtonVariant, string> = {
  primary:
    'bg-primary text-primary-foreground hover:bg-primary/90 focus-visible:outline-primary',
  secondary:
    'border border-border bg-surface-raised text-content hover:bg-surface focus-visible:outline-primary',
  danger:
    'bg-danger text-primary-foreground hover:bg-danger/90 focus-visible:outline-danger',
};

const SIZES: Record<ButtonSize, string> = {
  sm: 'h-8 px-3 text-sm',
  md: 'h-10 px-4 text-base',
};

type LoadingProps =
  | {
      loading: true;
      /** Text announced while loading; it comes from the consumer (D17). */
      loadingLabel: string;
    }
  | { loading?: false; loadingLabel?: string };

export type ButtonProps = ComponentPropsWithRef<'button'> & {
  variant?: ButtonVariant;
  size?: ButtonSize;
} & LoadingProps;

export function Button({
  variant = 'primary',
  size = 'md',
  loading = false,
  loadingLabel,
  type = 'button',
  disabled = false,
  className,
  children,
  ref,
  ...rest
}: ButtonProps) {
  return (
    <button
      ref={ref}
      type={type}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      className={cx(BASE, VARIANTS[variant], SIZES[size], className)}
      {...rest}
    >
      {loading && loadingLabel !== undefined ? (
        <Spinner label={loadingLabel} />
      ) : null}
      {children}
    </button>
  );
}
