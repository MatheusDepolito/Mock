import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { axe } from 'jest-axe';
import { useState } from 'react';
import { Dialog } from './Dialog';

function Harness({ onClose }: { onClose?: () => void }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" onClick={() => setOpen(true)}>
        Open dialog
      </button>
      <Dialog
        open={open}
        onClose={() => {
          onClose?.();
          setOpen(false);
        }}
        title="Confirm deletion"
        description="This cannot be undone."
        closeLabel="Close dialog"
        actions={<button type="button">Delete</button>}
      >
        <p>Body content</p>
      </Dialog>
    </>
  );
}

describe('Dialog', () => {
  it('does not render its content while closed', () => {
    render(<Harness />);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(screen.queryByText('Body content')).not.toBeInTheDocument();
  });

  it('renders a dialog named by its title, with description, body and actions', async () => {
    const user = userEvent.setup();
    render(<Harness />);
    await user.click(screen.getByRole('button', { name: 'Open dialog' }));
    const dialog = await screen.findByRole('dialog', {
      name: 'Confirm deletion',
    });
    expect(dialog).toHaveAccessibleDescription('This cannot be undone.');
    expect(within(dialog).getByText('Body content')).toBeInTheDocument();
    expect(
      within(dialog).getByRole('button', { name: 'Delete' }),
    ).toBeInTheDocument();
  });

  it('moves focus into the dialog on open and back to the trigger on close', async () => {
    const user = userEvent.setup();
    render(<Harness />);
    const trigger = screen.getByRole('button', { name: 'Open dialog' });
    await user.click(trigger);
    const dialog = await screen.findByRole('dialog');
    await waitFor(() =>
      expect(dialog).toContainElement(document.activeElement as HTMLElement),
    );
    await user.keyboard('{Escape}');
    await waitFor(() =>
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument(),
    );
    await waitFor(() => expect(trigger).toHaveFocus());
  });

  it('closes with Escape and calls onClose', async () => {
    const onClose = vi.fn();
    const user = userEvent.setup();
    render(<Harness onClose={onClose} />);
    await user.click(screen.getByRole('button', { name: 'Open dialog' }));
    await screen.findByRole('dialog');
    await user.keyboard('{Escape}');
    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('closes when the backdrop is clicked', async () => {
    const onClose = vi.fn();
    const user = userEvent.setup();
    render(<Harness onClose={onClose} />);
    await user.click(screen.getByRole('button', { name: 'Open dialog' }));
    const dialog = await screen.findByRole('dialog');
    const backdrop = dialog.querySelector('[class*="bg-content"]');
    expect(backdrop).not.toBeNull();
    await user.click(backdrop as Element);
    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('closes through the close button, named by the closeLabel prop', async () => {
    const onClose = vi.fn();
    const user = userEvent.setup();
    render(<Harness onClose={onClose} />);
    await user.click(screen.getByRole('button', { name: 'Open dialog' }));
    await user.click(
      await screen.findByRole('button', { name: 'Close dialog' }),
    );
    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('keeps Tab inside the dialog', async () => {
    const user = userEvent.setup();
    render(<Harness />);
    await user.click(screen.getByRole('button', { name: 'Open dialog' }));
    const dialog = await screen.findByRole('dialog');
    for (let i = 0; i < 4; i += 1) {
      await user.tab();
      expect(dialog).toContainElement(document.activeElement as HTMLElement);
    }
  });

  it('has no fixed interface text (title, description, label and body only)', async () => {
    render(
      <Dialog open onClose={() => undefined} title="T" closeLabel="X">
        {null}
      </Dialog>,
    );
    const dialog = await screen.findByRole('dialog');
    expect(dialog.textContent).toBe('T');
    expect(screen.getByRole('button', { name: 'X' })).toBeInTheDocument();
  });

  describe('accessibility (axe)', () => {
    it('has no violation when open', async () => {
      const { baseElement } = render(
        <Dialog
          open
          onClose={() => undefined}
          title="Confirm"
          description="Sure?"
          closeLabel="Close"
          actions={<button type="button">OK</button>}
        >
          <p>Body</p>
        </Dialog>,
      );
      await screen.findByRole('dialog');
      expect(await axe(baseElement)).toHaveNoViolations();
    });

    it('negative control: a dialog without an accessible name is reported', async () => {
      const { container } = render(
        <div role="dialog" aria-modal="true">
          <p>Body</p>
        </div>,
      );
      const results = await axe(container);
      expect(results.violations.map((v) => v.id)).toContain('aria-dialog-name');
    });
  });
});
