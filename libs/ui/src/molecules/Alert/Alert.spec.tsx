import { render, screen } from '@testing-library/react';
import { axe } from 'jest-axe';
import { createRef } from 'react';
import { Alert } from './Alert';

describe('Alert', () => {
  it('renders the children and the optional title', () => {
    render(<Alert title="Saved">Your changes were stored.</Alert>);
    expect(screen.getByText('Saved')).toBeInTheDocument();
    expect(screen.getByText('Your changes were stored.')).toBeInTheDocument();
  });

  it('has no title element without a title', () => {
    const { container } = render(<Alert>Body</Alert>);
    expect(container.querySelector('p')).toBeNull();
  });

  it.each([
    ['info', 'status', 'border-l-primary'],
    ['success', 'status', 'border-l-success'],
    ['danger', 'alert', 'border-l-danger'],
  ] as const)('tone %s has role %s and the %s bar', (tone, role, bar) => {
    render(<Alert tone={tone}>Body</Alert>);
    expect(screen.getByRole(role)).toHaveClass(
      bar,
      'bg-surface',
      'text-content',
    );
  });

  it('defaults to info (a polite status)', () => {
    render(<Alert>Body</Alert>);
    expect(screen.getByRole('status')).toHaveClass('border-l-primary');
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('has no fixed text and no fixed icon', () => {
    const { container } = render(<Alert>Body</Alert>);
    expect(container.textContent).toBe('Body');
    expect(container.querySelector('svg')).toBeNull();
  });

  it('forwards the ref and appends className last', () => {
    const ref = createRef<HTMLDivElement>();
    render(
      <Alert ref={ref} className="custom">
        Body
      </Alert>,
    );
    expect(ref.current).toBeInstanceOf(HTMLDivElement);
    expect(ref.current?.className.endsWith('custom')).toBe(true);
  });

  it.each(['info', 'success', 'danger'] as const)(
    'has no accessibility violation (%s)',
    async (tone) => {
      const { container } = render(
        <Alert tone={tone} title="Heads up">
          Body
        </Alert>,
      );
      expect(await axe(container)).toHaveNoViolations();
    },
  );
});
