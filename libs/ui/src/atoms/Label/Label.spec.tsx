import { render, screen } from '@testing-library/react';
import { axe } from 'jest-axe';
import { createRef } from 'react';
import { Label } from './Label';

describe('Label', () => {
  it('names the control it is associated with', () => {
    render(
      <>
        <Label htmlFor="name">Name</Label>
        <input id="name" />
      </>,
    );
    expect(screen.getByRole('textbox', { name: 'Name' })).toBeInTheDocument();
  });

  it('shows the required marker only when asked, hidden from assistive technology', () => {
    const { container, rerender } = render(<Label htmlFor="a">Name</Label>);
    expect(container.querySelector('[aria-hidden="true"]')).toBeNull();
    rerender(
      <Label htmlFor="a" required>
        Name
      </Label>,
    );
    const marker = container.querySelector('[aria-hidden="true"]');
    expect(marker).toHaveTextContent('*');
  });

  it('keeps the marker out of the accessible name', () => {
    render(
      <>
        <Label htmlFor="name" required>
          Name
        </Label>
        <input id="name" required />
      </>,
    );
    expect(screen.getByRole('textbox', { name: 'Name' })).toBeRequired();
  });

  it('does not forward required to the DOM label', () => {
    const { container } = render(
      <Label htmlFor="a" required>
        Name
      </Label>,
    );
    expect(container.querySelector('label')).not.toHaveAttribute('required');
  });

  it('has no fixed interface text', () => {
    const { container } = render(<Label />);
    expect(container.textContent).toBe('');
  });

  it('forwards the ref and appends className last', () => {
    const ref = createRef<HTMLLabelElement>();
    render(
      <Label ref={ref} htmlFor="a" className="custom">
        Name
      </Label>,
    );
    expect(ref.current).toBeInstanceOf(HTMLLabelElement);
    expect(ref.current?.className.endsWith('custom')).toBe(true);
  });

  it('has no accessibility violation (plain and required)', async () => {
    const { container } = render(
      <div>
        <Label htmlFor="a">Name</Label>
        <input id="a" />
        <Label htmlFor="b" required>
          Email
        </Label>
        <input id="b" required />
      </div>,
    );
    expect(await axe(container)).toHaveNoViolations();
  });

  it('negative control: an input without a label is reported', async () => {
    const { container } = render(<input />);
    const results = await axe(container);
    expect(results.violations.map((v) => v.id)).toContain('label');
  });
});
