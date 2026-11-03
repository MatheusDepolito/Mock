import type { ComponentPropsWithRef, ReactNode } from 'react';
import { Icon } from '../../atoms/Icon';
import type { IconComponent } from '../../atoms/Icon';
import { cx } from '../../internal/cx';

export type EmptyStateHeading = 'h2' | 'h3' | 'h4';

export interface EmptyStateProps extends Omit<
  ComponentPropsWithRef<'div'>,
  'title'
> {
  /** Decorative icon component; the library does not import an icon catalog. */
  icon: IconComponent;
  title: ReactNode;
  description?: ReactNode;
  /** Optional call to action (a node, such as a Button). */
  action?: ReactNode;
  /** Heading level of the title; the consumer knows the page outline. */
  headingLevel?: EmptyStateHeading;
}

export function EmptyState({
  icon,
  title,
  description,
  action,
  headingLevel = 'h3',
  className,
  ref,
  ...rest
}: EmptyStateProps) {
  const Heading = headingLevel;
  return (
    <div
      ref={ref}
      className={cx(
        'flex flex-col items-center gap-3 p-8 text-center font-sans',
        className,
      )}
      {...rest}
    >
      <Icon icon={icon} size="lg" className="text-content-muted" />
      <Heading className="text-lg font-medium text-content">{title}</Heading>
      {description !== undefined ? (
        <p className="max-w-md text-base text-content-muted">{description}</p>
      ) : null}
      {action !== undefined ? <div className="mt-2">{action}</div> : null}
    </div>
  );
}
