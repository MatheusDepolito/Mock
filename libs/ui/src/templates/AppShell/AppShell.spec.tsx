import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { axe } from 'jest-axe';
import { createRef } from 'react';
import { AppHeader } from '../../organisms/AppHeader';
import type { NavItem } from '../../organisms/nav-types';
import { SideNav } from '../../organisms/SideNav';
import { AppShell } from './AppShell';

const ITEMS: NavItem[] = [
  { id: 'a', label: 'Alpha', href: '/alpha', current: true },
  { id: 'b', label: 'Beta', href: '/beta' },
];

function withSidebar() {
  return (
    <AppShell
      skipLinkLabel="Skip to content"
      menuLabel="Menu"
      closeLabel="Close menu"
      header={(menu) => <AppHeader brand={<span>Brand</span>} {...menu} />}
      sidebar={<SideNav label="Main" items={ITEMS} />}
    >
      <p>Page content</p>
    </AppShell>
  );
}

function withoutSidebar() {
  return (
    <AppShell skipLinkLabel="Skip" header={<AppHeader brand="Brand" />}>
      <p>Page content</p>
    </AppShell>
  );
}

describe('AppShell', () => {
  describe('landmarks', () => {
    it('exposes banner, navigation (named) and main', () => {
      render(withSidebar());
      expect(screen.getByRole('banner')).toHaveTextContent('Brand');
      expect(
        screen.getByRole('navigation', { name: 'Main' }),
      ).toBeInTheDocument();
      expect(screen.getByRole('main')).toHaveTextContent('Page content');
    });

    it('has exactly one navigation while the drawer is closed', () => {
      render(withSidebar());
      expect(screen.getAllByRole('navigation')).toHaveLength(1);
    });

    it('has no navigation and no menu button without a sidebar', () => {
      render(withoutSidebar());
      expect(screen.queryByRole('navigation')).not.toBeInTheDocument();
      expect(screen.queryByRole('button')).not.toBeInTheDocument();
      expect(screen.getByRole('main')).toBeInTheDocument();
    });

    it('shows the fixed sidebar only at lg and above (hidden below it)', () => {
      render(withSidebar());
      const wrapper = screen.getByRole('navigation').parentElement;
      expect(wrapper).toHaveClass('hidden', 'lg:block');
    });
  });

  describe('skip link', () => {
    it('is the first tab stop and moves focus to main', async () => {
      const user = userEvent.setup();
      render(withSidebar());
      await user.tab();
      const skip = screen.getByRole('link', { name: 'Skip to content' });
      expect(skip).toHaveFocus();
      await user.keyboard('{Enter}');
      expect(screen.getByRole('main')).toHaveFocus();
    });

    it('points to the id of main and is visually hidden until focused', () => {
      render(withSidebar());
      const skip = screen.getByRole('link', { name: 'Skip to content' });
      expect(skip).toHaveAttribute('href', `#${screen.getByRole('main').id}`);
      expect(skip).toHaveClass('sr-only', 'focus:not-sr-only');
    });
  });

  describe('drawer', () => {
    it('opens from the menu button and moves focus into the drawer', async () => {
      const user = userEvent.setup();
      render(withSidebar());
      expect(screen.getByRole('button', { name: 'Menu' })).toHaveAttribute(
        'aria-expanded',
        'false',
      );
      await user.click(screen.getByRole('button', { name: 'Menu' }));
      const dialog = await screen.findByRole('dialog', { name: 'Menu' });
      await waitFor(() =>
        expect(dialog).toContainElement(document.activeElement as HTMLElement),
      );
      expect(
        within(dialog).getByRole('navigation', { name: 'Main' }),
      ).toBeInTheDocument();
    });

    it('never exposes two navigation landmarks at once', async () => {
      const user = userEvent.setup();
      render(withSidebar());
      await user.click(screen.getByRole('button', { name: 'Menu' }));
      await screen.findByRole('dialog');
      expect(screen.getAllByRole('navigation', { hidden: true })).toHaveLength(
        1,
      );
      expect(screen.getAllByRole('navigation')).toHaveLength(1);
    });

    it('links the menu button to the drawer (aria-controls) while open', async () => {
      const user = userEvent.setup();
      render(withSidebar());
      await user.click(screen.getByRole('button', { name: 'Menu' }));
      const dialog = await screen.findByRole('dialog');
      const button = document.querySelector(
        'button[aria-controls]',
      ) as HTMLElement;
      expect(button).toHaveAttribute('aria-controls', dialog.id);
      expect(button).toHaveAttribute('aria-expanded', 'true');
    });

    it('closes with Escape and returns focus to the menu button', async () => {
      const user = userEvent.setup();
      render(withSidebar());
      const button = screen.getByRole('button', { name: 'Menu' });
      await user.click(button);
      await screen.findByRole('dialog');
      await user.keyboard('{Escape}');
      await waitFor(() =>
        expect(screen.queryByRole('dialog')).not.toBeInTheDocument(),
      );
      await waitFor(() => expect(button).toHaveFocus());
      expect(screen.getAllByRole('navigation')).toHaveLength(1);
      expect(button).toHaveAttribute('aria-expanded', 'false');
    });

    it('closes through the close button, named by closeLabel', async () => {
      const user = userEvent.setup();
      render(withSidebar());
      await user.click(screen.getByRole('button', { name: 'Menu' }));
      await user.click(
        await screen.findByRole('button', { name: 'Close menu' }),
      );
      await waitFor(() =>
        expect(screen.queryByRole('dialog')).not.toBeInTheDocument(),
      );
    });

    it('closes when the backdrop is clicked', async () => {
      const user = userEvent.setup();
      render(withSidebar());
      await user.click(screen.getByRole('button', { name: 'Menu' }));
      const dialog = await screen.findByRole('dialog');
      await user.click(
        dialog.querySelector('[class*="bg-content"]') as Element,
      );
      await waitFor(() =>
        expect(screen.queryByRole('dialog')).not.toBeInTheDocument(),
      );
    });

    it('is not in the DOM while closed and is hidden at lg and above', async () => {
      const user = userEvent.setup();
      render(withSidebar());
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
      await user.click(screen.getByRole('button', { name: 'Menu' }));
      expect(await screen.findByRole('dialog')).toHaveClass('lg:hidden');
    });
  });

  it('has no fixed interface text (only what the consumer passes)', () => {
    const { container } = render(
      <AppShell skipLinkLabel="S" header={<AppHeader brand="B" />}>
        C
      </AppShell>,
    );
    expect(container.textContent).toBe('SBC');
  });

  it('forwards the ref and appends className last', () => {
    const ref = createRef<HTMLDivElement>();
    render(
      <AppShell
        ref={ref}
        skipLinkLabel="S"
        header={<AppHeader brand="B" />}
        className="custom"
      >
        C
      </AppShell>,
    );
    expect(ref.current?.className.endsWith('custom')).toBe(true);
  });

  describe('accessibility (axe)', () => {
    it('has no violation with a sidebar (drawer closed)', async () => {
      const { container } = render(withSidebar());
      expect(await axe(container)).toHaveNoViolations();
    });

    it('has no violation without a sidebar', async () => {
      const { container } = render(withoutSidebar());
      expect(await axe(container)).toHaveNoViolations();
    });

    it('has no violation with the drawer open', async () => {
      const user = userEvent.setup();
      const { baseElement } = render(withSidebar());
      await user.click(screen.getByRole('button', { name: 'Menu' }));
      await screen.findByRole('dialog');
      expect(await axe(baseElement)).toHaveNoViolations();
    });

    it('negative control: duplicated main landmarks are reported', async () => {
      const { container } = render(
        <div>
          <main>One</main>
          <main>Two</main>
        </div>,
      );
      const results = await axe(container);
      expect(results.violations.map((v) => v.id)).toContain(
        'landmark-no-duplicate-main',
      );
    });
  });
});
