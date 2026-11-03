import type { ComponentPropsWithRef } from 'react';
import { cx } from '../../internal/cx';

export interface LabelProps extends ComponentPropsWithRef<'label'> {
  /**
   * Shows a visual `*` marker. It is `aria-hidden`: the semantic requirement
   * belongs to the control (`required` / `aria-required`), not to the label.
   */
  required?: boolean;
}

export function Label({
  required = false,
  className,
  children,
  ref,
  ...rest
}: LabelProps) {
  return (
    // The control is associated by the consumer (`htmlFor` or nesting).
    <label
      ref={ref}
      className={cx(
        'block font-sans text-sm font-medium text-content',
        className,
      )}
      {...rest}
    >
      {children}
      {required ? (
        <span aria-hidden="true" className="ml-1 text-danger">
          *
        </span>
      ) : null}
    </label>
  );
}
