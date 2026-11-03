import { Dialog, DialogBackdrop, DialogPanel } from '@headlessui/react';
import { IconX } from '@tabler/icons-react';
import type { ReactNode } from 'react';
import { Icon } from '../../atoms/Icon';
import { DrawerContext } from '../../internal/drawer-context';

export interface AppShellDrawerProps {
  id: string;
  open: boolean;
  onClose: () => void;
  /** Accessible name of the drawer dialog. */
  label: string;
  closeLabel: string;
  children: ReactNode;
}

/**
 * Side drawer of the shell (private to the template). It composes Headless UI's
 * own dialog, so focus trap, `Esc` and backdrop click work as in the `Dialog`
 * molecule; that one is centred and a drawer is not, hence this composition.
 * It only exists in the DOM while open, and the shell closes it when the
 * viewport reaches `lg`. It provides `DrawerContext`, so a `SideNav` inside it
 * closes the drawer when a link is followed.
 */
export function AppShellDrawer({
  id,
  open,
  onClose,
  label,
  closeLabel,
  children,
}: AppShellDrawerProps) {
  return (
    <Dialog
      id={id}
      open={open}
      onClose={() => onClose()}
      aria-label={label}
      className="relative z-50 lg:hidden"
    >
      <DialogBackdrop className="fixed inset-0 bg-content/50" />
      <div className="fixed inset-0 flex">
        <DialogPanel className="relative flex h-full w-72 max-w-full flex-col bg-surface-raised font-sans text-content shadow-card">
          <button
            type="button"
            aria-label={closeLabel}
            onClick={() => onClose()}
            className="absolute right-3 top-3 rounded-sm p-1 text-content-muted hover:text-content focus-visible:outline-2 focus-visible:outline-primary"
          >
            <Icon icon={IconX} size="md" />
          </button>
          <DrawerContext.Provider value={{ closeDrawer: onClose }}>
            <div className="mt-12 overflow-y-auto">{children}</div>
          </DrawerContext.Provider>
        </DialogPanel>
      </div>
    </Dialog>
  );
}
