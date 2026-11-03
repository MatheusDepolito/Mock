import { IconHome } from '@tabler/icons-react';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { axe } from 'jest-axe';
import { createRef } from 'react';
import type { NavItem, RenderLink } from '../nav-types';
import { SideNav } from './SideNav';

const ITEMS: NavItem[] = [
  { id: 'a', label: 'Alpha', href: '/alpha', current: true },
  { id: 'b', label: 'Beta', href: '/beta', icon: IconHome },
  { id: 'c', label: 'Gamma', href: '/gamma' },
];

describe('SideNav', () => {
  it('is a navigation landmark named by the label prop', () => {
    render(<SideNav label="Main" items={ITEMS} />);
    expect(
      screen.getByRole('navigation', { name: 'Main' }),
    ).toBeInTheDocument();
  });

  it('renders one link per item with its href', () => {
    render(<SideNav label="Main" items={ITEMS} />);
    const links = within(screen.getByRole('navigation')).getAllByRole('link');
    expect(links.map((l) => l.getAttribute('href'))).toEqual([
      '/alpha',
      '/beta',
      '/gamma',
    ]);
    expect(links.map((l) => l.textContent)).toEqual(['Alpha', 'Beta', 'Gamma']);
  });

  it('marks only the current item with aria-current="page" and a distinct style', () => {
    render(<SideNav label="Main" items={ITEMS} />);
    const current = screen.getByRole('link', { name: 'Alpha' });
    expect(current).toHaveAttribute('aria-current', 'page');
    expect(current).toHaveClass('text-primary', 'font-medium', 'bg-surface');
    const other = screen.getByRole('link', { name: 'Beta' });
    expect(other).not.toHaveAttribute('aria-current');
    expect(other).toHaveClass('text-content');
    expect(
      screen.getAllByRole('link').filter((l) => l.hasAttribute('aria-current')),
    ).toHaveLength(1);
  });

  it('declares hover and visible focus styles on every link', () => {
    render(<SideNav label="Main" items={ITEMS} />);
    for (const link of screen.getAllByRole('link')) {
      expect(link).toHaveClass(
        'hover:bg-surface',
        'focus-visible:outline-2',
        'focus-visible:outline-primary',
      );
    }
  });

  it('shows the icon as decorative and only for items that have one', () => {
    const { container } = render(<SideNav label="Main" items={ITEMS} />);
    const svgs = container.querySelectorAll('svg');
    expect(svgs).toHaveLength(1);
    expect(svgs[0]).toHaveAttribute('aria-hidden', 'true');
  });

  it('is reachable and operable by keyboard', async () => {
    const user = userEvent.setup();
    render(<SideNav label="Main" items={ITEMS} />);
    await user.tab();
    expect(screen.getByRole('link', { name: 'Alpha' })).toHaveFocus();
    await user.tab();
    expect(screen.getByRole('link', { name: 'Beta' })).toHaveFocus();
  });

  describe('renderLink', () => {
    it('receives href, className, aria-current and children, and is used instead of <a>', () => {
      const calls: Array<Record<string, unknown>> = [];
      const renderLink: RenderLink = (props) => {
        calls.push({ ...props });
        return (
          <span role="link" data-href={props.href} className={props.className}>
            {props.children}
          </span>
        );
      };
      render(<SideNav label="Main" items={ITEMS} renderLink={renderLink} />);
      expect(calls).toHaveLength(3);
      expect(calls[0]).toMatchObject({
        href: '/alpha',
        'aria-current': 'page',
      });
      expect(calls[1]).not.toHaveProperty('aria-current');
      expect(typeof calls[0]?.['className']).toBe('string');
      expect(screen.getAllByRole('link')[1]).toHaveAttribute(
        'data-href',
        '/beta',
      );
      expect(document.querySelector('a')).toBeNull();
    });
  });

  it('has no items and no fixed text without data', () => {
    render(<SideNav label="Main" items={[]} />);
    expect(screen.getByRole('navigation').textContent).toBe('');
  });

  it('forwards the ref and appends className last', () => {
    const ref = createRef<HTMLElement>();
    render(<SideNav ref={ref} label="Main" items={ITEMS} className="custom" />);
    expect(ref.current?.tagName).toBe('NAV');
    expect(ref.current?.className.endsWith('custom')).toBe(true);
  });

  describe('accessibility (axe)', () => {
    it('has no violation', async () => {
      const { container } = render(<SideNav label="Main" items={ITEMS} />);
      expect(await axe(container)).toHaveNoViolations();
    });

    it('negative control: two navigation landmarks without names are reported', async () => {
      const { container } = render(
        <div>
          <nav>
            <a href="/a">A</a>
          </nav>
          <nav>
            <a href="/b">B</a>
          </nav>
        </div>,
      );
      const results = await axe(container);
      expect(results.violations.map((v) => v.id)).toContain('landmark-unique');
    });
  });
});
