import { render, screen } from '@testing-library/react';
import { axe } from 'jest-axe';
import { createRef } from 'react';
import { TextInput } from '../../atoms/TextInput';
import { FormField } from './FormField';

const field = (props: Partial<Parameters<typeof FormField>[0]> = {}) => (
  <FormField label="Name" {...props}>
    {(control) => <TextInput {...control} />}
  </FormField>
);

describe('FormField', () => {
  it('associates the label with the control', () => {
    render(field());
    const input = screen.getByLabelText('Name');
    expect(input.tagName).toBe('INPUT');
    expect(screen.getByRole('textbox', { name: 'Name' })).toBe(input);
  });

  it('works with any control, not only TextInput (render prop, no cloning)', () => {
    render(
      <>
        <FormField label="Country">
          {(control) => (
            <select {...control}>
              <option>A</option>
            </select>
          )}
        </FormField>
        <FormField label="Notes">
          {(control) => <textarea {...control} />}
        </FormField>
      </>,
    );
    expect(
      screen.getByRole('combobox', { name: 'Country' }),
    ).toBeInTheDocument();
    expect(screen.getByRole('textbox', { name: 'Notes' })).toBeInTheDocument();
  });

  describe('aria-describedby', () => {
    it('is absent with neither hint nor error', () => {
      render(field());
      const input = screen.getByRole('textbox');
      expect(input).not.toHaveAttribute('aria-describedby');
      expect(input).not.toHaveAttribute('aria-invalid');
    });

    it('points to the hint when there is only a hint', () => {
      render(field({ hint: 'At least 3 letters' }));
      const input = screen.getByRole('textbox');
      const hint = screen.getByText('At least 3 letters');
      expect(input).toHaveAttribute('aria-describedby', hint.id);
      expect(input).toHaveAccessibleDescription('At least 3 letters');
      expect(input).not.toHaveAttribute('aria-invalid');
    });

    it('points to the error when there is only an error, and marks it invalid', () => {
      render(field({ error: 'Required' }));
      const input = screen.getByRole('textbox');
      const error = screen.getByText('Required');
      expect(input).toHaveAttribute('aria-describedby', error.id);
      expect(input).toHaveAttribute('aria-invalid', 'true');
      expect(input).toHaveAccessibleDescription('Required');
    });

    it('lists the hint and then the error when both exist', () => {
      render(field({ hint: 'Hint text', error: 'Error text' }));
      const input = screen.getByRole('textbox');
      const hint = screen.getByText('Hint text');
      const error = screen.getByText('Error text');
      expect(input).toHaveAttribute(
        'aria-describedby',
        `${hint.id} ${error.id}`,
      );
      expect(input).toHaveAccessibleDescription('Hint text Error text');
      expect(input).toHaveAttribute('aria-invalid', 'true');
    });
  });

  describe('error announcement', () => {
    it('is not an alert by default', () => {
      render(field({ error: 'Required' }));
      expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    });

    it('is an alert when announceError is set', () => {
      render(field({ error: 'Required', announceError: true }));
      expect(screen.getByRole('alert')).toHaveTextContent('Required');
    });
  });

  it('shows the required marker (hidden from assistive tech) and requires the control', () => {
    const { container } = render(field({ required: true }));
    expect(container.querySelector('[aria-hidden="true"]')).toHaveTextContent(
      '*',
    );
    expect(screen.getByRole('textbox', { name: 'Name' })).toBeRequired();
  });

  it('generates distinct ids for each field', () => {
    render(
      <>
        {field({ hint: 'h' })}
        {field({ hint: 'h' })}
      </>,
    );
    const [a, b] = screen.getAllByRole('textbox');
    expect(a?.id).toBeTruthy();
    expect(a?.id).not.toBe(b?.id);
  });

  it('has no fixed interface text (only what the consumer passes)', () => {
    const { container } = render(
      <FormField label="L" hint="H" error="E">
        {(control) => <TextInput {...control} />}
      </FormField>,
    );
    expect(container.textContent).toBe('LHE');
  });

  it('forwards the ref and appends className last', () => {
    const ref = createRef<HTMLDivElement>();
    render(
      <FormField ref={ref} label="Name" className="custom">
        {(control) => <TextInput {...control} />}
      </FormField>,
    );
    expect(ref.current).toBeInstanceOf(HTMLDivElement);
    expect(ref.current?.className.endsWith('custom')).toBe(true);
  });

  describe('accessibility (axe)', () => {
    it.each([
      ['plain', {}],
      ['with hint', { hint: 'Hint' }],
      ['with error', { error: 'Error' }],
      [
        'with hint and error',
        { hint: 'Hint', error: 'Error', announceError: true },
      ],
      ['required', { required: true }],
    ] as const)('has no violation (%s)', async (_name, props) => {
      const { container } = render(field(props));
      expect(await axe(container)).toHaveNoViolations();
    });

    it('negative control: a control that ignores the received props is reported', async () => {
      const { container } = render(
        <FormField label="Name">{() => <input />}</FormField>,
      );
      const results = await axe(container);
      expect(results.violations.map((v) => v.id)).toContain('label');
    });
  });
});
