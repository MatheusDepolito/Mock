import { render, screen } from '@testing-library/react';
import { axe } from 'jest-axe';
import { createRef } from 'react';
import { FieldError } from './FieldError';

describe('FieldError', () => {
  it('renders the message from children in a paragraph with the id', () => {
    render(<FieldError id="e1">Invalid value</FieldError>);
    const error = screen.getByText('Invalid value');
    expect(error.tagName).toBe('P');
    expect(error).toHaveAttribute('id', 'e1');
  });

  it('has no role by default and role="alert" when announced', () => {
    const { rerender } = render(<FieldError id="e1">Invalid</FieldError>);
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    rerender(
      <FieldError id="e1" announce>
        Invalid
      </FieldError>,
    );
    expect(screen.getByRole('alert')).toHaveTextContent('Invalid');
  });

  it('describes the control that references its id', () => {
    render(
      <>
        <label htmlFor="a">Name</label>
        <input id="a" aria-invalid="true" aria-describedby="e1" />
        <FieldError id="e1">Required</FieldError>
      </>,
    );
    expect(screen.getByRole('textbox')).toHaveAccessibleDescription('Required');
  });

  it('uses the danger token and has no fixed interface text', () => {
    const { container } = render(<FieldError id="e1" />);
    expect(container.textContent).toBe('');
    expect(container.querySelector('p')).toHaveClass('text-danger');
  });

  it('forwards the ref and appends className last', () => {
    const ref = createRef<HTMLParagraphElement>();
    render(
      <FieldError ref={ref} id="e1" className="custom">
        Invalid
      </FieldError>,
    );
    expect(ref.current).toBeInstanceOf(HTMLParagraphElement);
    expect(ref.current?.className.endsWith('custom')).toBe(true);
  });

  it.each([false, true])(
    'has no accessibility violation (announce=%s)',
    async (announce) => {
      const { container } = render(
        <div>
          <label htmlFor="a">Name</label>
          <input id="a" aria-describedby="e1" />
          <FieldError id="e1" announce={announce}>
            Required
          </FieldError>
        </div>,
      );
      expect(await axe(container)).toHaveNoViolations();
    },
  );
});
