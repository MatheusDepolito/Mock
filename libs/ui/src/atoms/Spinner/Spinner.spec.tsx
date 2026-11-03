import { render, screen } from '@testing-library/react';
import { axe } from 'jest-axe';
import { createRef } from 'react';
import { Spinner } from './Spinner';

describe('Spinner', () => {
  it('is a status region whose text is the label prop', () => {
    render(<Spinner label="Loading properties" />);
    const status = screen.getByRole('status');
    expect(status).toHaveTextContent('Loading properties');
    expect(status.textContent).toBe('Loading properties');
  });

  it('hides the drawing from assistive technology and animates it', () => {
    const { container } = render(<Spinner label="Wait" />);
    const svg = container.querySelector('svg');
    expect(svg).toHaveAttribute('aria-hidden', 'true');
    expect(svg).toHaveClass('animate-spin');
  });

  it('forwards the ref and appends className last', () => {
    const ref = createRef<HTMLSpanElement>();
    render(<Spinner ref={ref} label="Wait" className="custom" />);
    expect(ref.current).toBeInstanceOf(HTMLSpanElement);
    expect(ref.current).toHaveClass('inline-flex', 'custom');
    expect(ref.current?.className.endsWith('custom')).toBe(true);
  });

  it('has no accessibility violation', async () => {
    const { container } = render(<Spinner label="Loading" />);
    expect(await axe(container)).toHaveNoViolations();
  });
});
