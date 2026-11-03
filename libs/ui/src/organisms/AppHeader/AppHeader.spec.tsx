import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { axe } from 'jest-axe';
import { createRef } from 'react';
import { AppHeader } from './AppHeader';

const noop = (): void => undefined;

describe('AppHeader', () => {
  it('is the banner landmark and shows the brand', () => {
    render(<AppHeader brand={<span>Brand</span>} />);
    expect(screen.getByRole('banner')).toHaveTextContent('Brand');
  });

  it('renders the actions slot only when provided', () => {
    const { rerender } = render(<AppHeader brand="B" />);
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
    rerender(
      <AppHeader brand="B">
        <button type="button">Profile</button>
      </AppHeader>,
    );
    expect(screen.getByRole('button', { name: 'Profile' })).toBeInTheDocument();
  });

  it('has no menu button without onMenuClick', () => {
    render(<AppHeader brand="B" />);
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });

  it('shows the menu button named by menuLabel and calls onMenuClick', async () => {
    const onMenuClick = vi.fn();
    render(<AppHeader brand="B" onMenuClick={onMenuClick} menuLabel="Menu" />);
    const button = screen.getByRole('button', { name: 'Menu' });
    expect(button).toHaveAttribute('type', 'button');
    await userEvent.click(button);
    expect(onMenuClick).toHaveBeenCalledTimes(1);
  });

  it('is only visible below lg and has a visible focus style', () => {
    render(
      <AppHeader brand="B" onMenuClick={() => undefined} menuLabel="Menu" />,
    );
    expect(screen.getByRole('button')).toHaveClass(
      'lg:hidden',
      'focus-visible:outline-2',
      'focus-visible:outline-primary',
    );
  });

  it('passes aria-expanded and aria-controls only when given', () => {
    const { rerender } = render(
      <AppHeader brand="B" onMenuClick={() => undefined} menuLabel="Menu" />,
    );
    const button = screen.getByRole('button');
    expect(button).not.toHaveAttribute('aria-expanded');
    expect(button).not.toHaveAttribute('aria-controls');
    rerender(
      <AppHeader
        brand="B"
        onMenuClick={() => undefined}
        menuLabel="Menu"
        menuExpanded={false}
        menuControls="drawer"
      />,
    );
    expect(screen.getByRole('button')).toHaveAttribute(
      'aria-expanded',
      'false',
    );
    expect(screen.getByRole('button')).toHaveAttribute(
      'aria-controls',
      'drawer',
    );
  });

  it('has no fixed interface text', () => {
    render(<AppHeader brand={null} />);
    expect(screen.getByRole('banner').textContent).toBe('');
  });

  it('forwards the ref and appends className last', () => {
    const ref = createRef<HTMLElement>();
    render(<AppHeader ref={ref} brand="B" className="custom" />);
    expect(ref.current?.tagName).toBe('HEADER');
    expect(ref.current?.className.endsWith('custom')).toBe(true);
  });

  it.each([
    ['plain', {}],
    ['with menu', { onMenuClick: noop, menuLabel: 'Menu' }],
    [
      'with menu and aria',
      {
        onMenuClick: noop,
        menuLabel: 'Menu',
        menuExpanded: false,
        menuControls: 'x',
      },
    ],
  ] as const)('has no accessibility violation (%s)', async (_name, props) => {
    const { container } = render(
      <AppHeader brand={<span>Brand</span>} {...props} />,
    );
    expect(await axe(container)).toHaveNoViolations();
  });
});
