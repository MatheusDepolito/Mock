import {
  Dialog as HeadlessDialog,
  DialogBackdrop,
  DialogDescription,
  DialogPanel,
  DialogTitle,
} from '@headlessui/react';
import { IconX } from '@tabler/icons-react';
import type { ReactNode } from 'react';
import { Icon } from '../../atoms/Icon';
import { cx } from '../../internal/cx';

export interface DialogProps {
  open: boolean;
  onClose: () => void;
  /** Becomes the accessible name of the dialog. */
  title: ReactNode;
  description?: ReactNode;
  /** Accessible name of the close button; it comes from the consumer (D17). */
  closeLabel: string;
  children?: ReactNode;
  /** Area for the actions (buttons), aligned to the end. */
  actions?: ReactNode;
  className?: string;
}

/** Modal dialog over Headless UI: focus trap, Esc and backdrop click close it. */
export function Dialog({
  open,
  onClose,
  title,
  description,
  closeLabel,
  children,
  actions,
  className,
}: DialogProps) {
  return (
    <HeadlessDialog
      open={open}
      onClose={() => onClose()}
      className="relative z-50"
    >
      <DialogBackdrop className="fixed inset-0 bg-content/50" />
      <div className="fixed inset-0 flex items-center justify-center p-4">
        <DialogPanel
          className={cx(
            'relative w-full max-w-md rounded-md bg-surface-raised p-6 font-sans text-content shadow-card',
            className,
          )}
        >
          <button
            type="button"
            aria-label={closeLabel}
            onClick={() => onClose()}
            className="absolute right-3 top-3 rounded-sm p-1 text-content-muted hover:text-content focus-visible:outline-2 focus-visible:outline-primary"
          >
            <Icon icon={IconX} size="md" />
          </button>
          <DialogTitle className="pr-8 text-lg font-medium text-content">
            {title}
          </DialogTitle>
          {description !== undefined ? (
            <DialogDescription className="mt-2 text-base text-content-muted">
              {description}
            </DialogDescription>
          ) : null}
          {children !== undefined ? (
            <div className="mt-4">{children}</div>
          ) : null}
          {actions !== undefined ? (
            <div className="mt-6 flex justify-end gap-3">{actions}</div>
          ) : null}
        </DialogPanel>
      </div>
    </HeadlessDialog>
  );
}
