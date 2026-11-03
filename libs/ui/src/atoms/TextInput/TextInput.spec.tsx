import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { axe } from 'jest-axe';
import { createRef } from 'react';
import { TextInput } from './TextInput';

describe('TextInput', () => {
  it('renders a text input by default', () => {
    render(<TextInput aria-label="Name" />);
    const input = screen.getByRole('textbox', { name: 'Name' });
    expect(input).toHaveAttribute('type', 'text');
  });

  it.each([
    ['email', 'textbox'],
    ['search', 'searchbox'],
    ['tel', 'textbox'],
    ['url', 'textbox'],
    ['number', 'spinbutton'],
  ] as const)('supports type=%s', (type, role) => {
    render(<TextInput type={type} aria-label="Field" />);
    expect(screen.getByRole(role)).toHaveAttribute('type', type);
  });

  it('supports type=password', () => {
    const { container } = render(<TextInput type="password" aria-label="Pw" />);
    expect(container.querySelector('input')).toHaveAttribute(
      'type',
      'password',
    );
  });

  it('accepts typing and calls onChange', async () => {
    const onChange = vi.fn();
    render(<TextInput aria-label="Name" onChange={onChange} />);
    const input = screen.getByRole('textbox');
    await userEvent.type(input, 'abc');
    expect(input).toHaveValue('abc');
    expect(onChange).toHaveBeenCalledTimes(3);
  });

  it('is valid by default: no aria-invalid and the boundary style', () => {
    render(<TextInput aria-label="Name" />);
    const input = screen.getByRole('textbox');
    expect(input).not.toHaveAttribute('aria-invalid');
    expect(input).toHaveClass('border-content-muted');
    expect(input).not.toHaveClass('border-danger');
  });

  it('applies aria-invalid and the danger style when invalid', () => {
    render(<TextInput aria-label="Name" invalid />);
    const input = screen.getByRole('textbox');
    expect(input).toHaveAttribute('aria-invalid', 'true');
    expect(input).toBeInvalid();
    expect(input).toHaveClass('border-danger', 'focus-visible:outline-danger');
  });

  it('also styles as invalid when aria-invalid comes from the outside', () => {
    render(<TextInput aria-label="Name" aria-invalid="true" />);
    expect(screen.getByRole('textbox')).toHaveClass('border-danger');
  });

  it('is disabled by the native attribute', async () => {
    const onChange = vi.fn();
    render(<TextInput aria-label="Name" disabled onChange={onChange} />);
    const input = screen.getByRole('textbox');
    expect(input).toBeDisabled();
    await userEvent.type(input, 'a');
    expect(onChange).not.toHaveBeenCalled();
    expect(input).toHaveClass(
      'disabled:opacity-50',
      'disabled:cursor-not-allowed',
    );
  });

  it('receives focus by Tab and declares a visible focus style', async () => {
    const user = userEvent.setup();
    render(<TextInput aria-label="Name" />);
    await user.tab();
    const input = screen.getByRole('textbox');
    expect(input).toHaveFocus();
    expect(input).toHaveClass(
      'focus-visible:outline-2',
      'focus-visible:outline-primary',
    );
  });

  it('has no fixed interface text (no placeholder, no value)', () => {
    render(<TextInput aria-label="Name" />);
    const input = screen.getByRole('textbox');
    expect(input).not.toHaveAttribute('placeholder');
    expect(input).toHaveValue('');
  });

  it('forwards the ref and appends className last', () => {
    const ref = createRef<HTMLInputElement>();
    render(<TextInput ref={ref} aria-label="Name" className="custom" />);
    expect(ref.current).toBeInstanceOf(HTMLInputElement);
    expect(ref.current?.className.endsWith('custom')).toBe(true);
  });

  describe('accessibility (axe)', () => {
    it.each([
      ['valid', {}],
      ['invalid', { invalid: true }],
      ['disabled', { disabled: true }],
    ] as const)('has no violation when %s', async (_name, props) => {
      const { container } = render(
        <div>
          <label htmlFor="f">Name</label>
          <TextInput id="f" {...props} />
        </div>,
      );
      expect(await axe(container)).toHaveNoViolations();
    });

    it('negative control: an input without a label is reported', async () => {
      const { container } = render(<TextInput />);
      const results = await axe(container);
      expect(results.violations.map((v) => v.id)).toContain('label');
    });
  });
});
