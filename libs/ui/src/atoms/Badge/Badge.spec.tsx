import { render, screen } from '@testing-library/react';
import { axe } from 'jest-axe';
import { createRef } from 'react';
import { Badge } from './Badge';

describe('Badge', () => {
  it('renders its children in a span', () => {
    render(<Badge>Active</Badge>);
    expect(screen.getByText('Active').tagName).toBe('SPAN');
  });

  it('has no fixed interface text', () => {
    const { container } = render(<Badge />);
    expect(container.textContent).toBe('');
  });

  it.each([
    ['neutral', ['bg-surface', 'text-content', 'border-border']],
    ['primary', ['bg-primary', 'text-primary-foreground']],
    ['success', ['bg-success', 'text-primary-foreground']],
    ['danger', ['bg-danger', 'text-primary-foreground']],
  ] as const)('applies the %s tone classes', (tone, classes) => {
    render(<Badge tone={tone}>Label</Badge>);
    expect(screen.getByText('Label')).toHaveClass(...classes);
  });

  it('uses the neutral tone by default', () => {
    render(<Badge>Label</Badge>);
    expect(screen.getByText('Label')).toHaveClass('bg-surface');
  });

  it('forwards the ref and appends className last', () => {
    const ref = createRef<HTMLSpanElement>();
    render(
      <Badge ref={ref} className="custom">
        Label
      </Badge>,
    );
    expect(ref.current).toBeInstanceOf(HTMLSpanElement);
    expect(ref.current?.className.endsWith('custom')).toBe(true);
  });

  it('forwards native attributes', () => {
    render(
      <Badge data-testid="badge" title="Status">
        Label
      </Badge>,
    );
    expect(screen.getByTestId('badge')).toHaveAttribute('title', 'Status');
  });

  it.each(['neutral', 'primary', 'success', 'danger'] as const)(
    'has no accessibility violation in the %s tone',
    async (tone) => {
      const { container } = render(<Badge tone={tone}>Label</Badge>);
      expect(await axe(container)).toHaveNoViolations();
    },
  );
});
