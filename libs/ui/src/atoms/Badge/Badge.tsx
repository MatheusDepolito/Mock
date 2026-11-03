import type { ComponentPropsWithRef } from 'react';
import { cx } from '../../internal/cx';

export type BadgeTone = 'neutral' | 'primary' | 'success' | 'danger';

const BASE =
  'inline-flex items-center rounded-sm px-2 py-0.5 font-sans text-sm font-medium';

// Closed map of complete class strings (see Button).
const TONES: Record<BadgeTone, string> = {
  neutral: 'border border-border bg-surface text-content',
  primary: 'bg-primary text-primary-foreground',
  success: 'bg-success text-primary-foreground',
  danger: 'bg-danger text-primary-foreground',
};

export interface BadgeProps extends ComponentPropsWithRef<'span'> {
  tone?: BadgeTone;
}

export function Badge({
  tone = 'neutral',
  className,
  children,
  ref,
  ...rest
}: BadgeProps) {
  return (
    <span ref={ref} className={cx(BASE, TONES[tone], className)} {...rest}>
      {children}
    </span>
  );
}
