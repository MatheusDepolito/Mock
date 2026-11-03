import type { ComponentPropsWithRef, ReactNode } from 'react';
import { cx } from '../../internal/cx';

export type AlertTone = 'info' | 'success' | 'danger';

const BASE =
  'flex flex-col gap-1 rounded-md border border-l-4 border-border bg-surface p-4 font-sans text-base text-content';

// Closed map of complete class strings (see Button). Only the left bar carries
// the tone; text always uses `content` on `surface`.
const TONES: Record<AlertTone, string> = {
  info: 'border-l-primary',
  success: 'border-l-success',
  danger: 'border-l-danger',
};

export interface AlertProps extends Omit<
  ComponentPropsWithRef<'div'>,
  'title' | 'role'
> {
  tone?: AlertTone;
  title?: ReactNode;
}

/** `danger` is announced at once (`alert`); the other tones are polite (`status`). */
export function Alert({
  tone = 'info',
  title,
  className,
  children,
  ref,
  ...rest
}: AlertProps) {
  return (
    <div
      ref={ref}
      role={tone === 'danger' ? 'alert' : 'status'}
      className={cx(BASE, TONES[tone], className)}
      {...rest}
    >
      {title !== undefined ? <p className="font-medium">{title}</p> : null}
      <div>{children}</div>
    </div>
  );
}
