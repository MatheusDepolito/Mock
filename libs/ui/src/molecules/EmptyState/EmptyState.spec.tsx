import { IconInbox } from '@tabler/icons-react';
import { render, screen } from '@testing-library/react';
import { axe } from 'jest-axe';
import { createRef } from 'react';
import { Button } from '../../atoms/Button';
import { EmptyState } from './EmptyState';

describe('EmptyState', () => {
  it('renders the title as a heading (h3 by default)', () => {
    render(<EmptyState icon={IconInbox} title="Nothing here" />);
    expect(
      screen.getByRole('heading', { level: 3, name: 'Nothing here' }),
    ).toBeInTheDocument();
  });

  it.each([2, 3, 4] as const)('supports heading level %s', (level) => {
    render(
      <EmptyState
        icon={IconInbox}
        title="Nothing"
        headingLevel={`h${level}` as 'h2' | 'h3' | 'h4'}
      />,
    );
    expect(screen.getByRole('heading', { level })).toBeInTheDocument();
  });

  it('shows the description and the action only when provided', () => {
    const { rerender } = render(<EmptyState icon={IconInbox} title="T" />);
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
    expect(screen.getByText('T').parentElement?.querySelector('p')).toBeNull();
    rerender(
      <EmptyState
        icon={IconInbox}
        title="T"
        description="Try another filter"
        action={<Button>Clear filters</Button>}
      />,
    );
    expect(screen.getByText('Try another filter')).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Clear filters' }),
    ).toBeInTheDocument();
  });

  it('renders the icon as decorative (aria-hidden)', () => {
    const { container } = render(<EmptyState icon={IconInbox} title="T" />);
    expect(container.querySelector('svg')).toHaveAttribute(
      'aria-hidden',
      'true',
    );
    expect(screen.queryByRole('img')).not.toBeInTheDocument();
  });

  it('has no fixed interface text', () => {
    const { container } = render(<EmptyState icon={IconInbox} title="T" />);
    expect(container.textContent).toBe('T');
  });

  it('forwards the ref and appends className last', () => {
    const ref = createRef<HTMLDivElement>();
    render(
      <EmptyState ref={ref} icon={IconInbox} title="T" className="custom" />,
    );
    expect(ref.current).toBeInstanceOf(HTMLDivElement);
    expect(ref.current?.className.endsWith('custom')).toBe(true);
  });

  it('has no accessibility violation (minimal and complete)', async () => {
    const { container } = render(
      <main>
        <EmptyState icon={IconInbox} title="Nothing" headingLevel="h2" />
        <EmptyState
          icon={IconInbox}
          title="Nothing"
          description="Try again"
          action={<Button>Retry</Button>}
        />
      </main>,
    );
    expect(await axe(container)).toHaveNoViolations();
  });
});
