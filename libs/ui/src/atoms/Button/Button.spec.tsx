import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { axe } from 'jest-axe';
import { createRef } from 'react';
import { Button } from './Button';

describe('Button', () => {
  it('renders its children and defaults to type="button"', () => {
    render(<Button>Save</Button>);
    const button = screen.getByRole('button', { name: 'Save' });
    expect(button).toHaveAttribute('type', 'button');
  });

  it('accepts another type', () => {
    render(<Button type="submit">Send</Button>);
    expect(screen.getByRole('button')).toHaveAttribute('type', 'submit');
  });

  it('has no fixed interface text', () => {
    render(<Button />);
    expect(screen.getByRole('button').textContent).toBe('');
  });

  it.each([
    ['primary', ['bg-primary', 'text-primary-foreground']],
    ['secondary', ['bg-surface-raised', 'text-content', 'border-border']],
    ['danger', ['bg-danger', 'text-primary-foreground']],
  ] as const)('applies the %s variant classes', (variant, classes) => {
    render(<Button variant={variant}>Action</Button>);
    expect(screen.getByRole('button')).toHaveClass(...classes);
  });

  it('uses primary and md by default', () => {
    render(<Button>Action</Button>);
    expect(screen.getByRole('button')).toHaveClass('bg-primary', 'h-10');
  });

  it.each([
    ['sm', 'h-8'],
    ['md', 'h-10'],
  ] as const)('applies the %s size', (size, cls) => {
    render(<Button size={size}>Action</Button>);
    expect(screen.getByRole('button')).toHaveClass(cls);
  });

  it('is disabled and does not fire onClick', async () => {
    const onClick = vi.fn();
    render(
      <Button disabled onClick={onClick}>
        Action
      </Button>,
    );
    const button = screen.getByRole('button');
    expect(button).toBeDisabled();
    await userEvent.click(button);
    expect(onClick).not.toHaveBeenCalled();
  });

  it('fires onClick when enabled', async () => {
    const onClick = vi.fn();
    render(<Button onClick={onClick}>Action</Button>);
    await userEvent.click(screen.getByRole('button'));
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  describe('loading', () => {
    it('disables the button, sets aria-busy and shows the labelled spinner', async () => {
      const onClick = vi.fn();
      render(
        <Button loading loadingLabel="Saving" onClick={onClick}>
          Save
        </Button>,
      );
      const button = screen.getByRole('button');
      expect(button).toBeDisabled();
      expect(button).toHaveAttribute('aria-busy', 'true');
      expect(screen.getByRole('status')).toHaveTextContent('Saving');
      await userEvent.click(button);
      expect(onClick).not.toHaveBeenCalled();
    });

    it('only shows the spinner text the consumer provided', () => {
      render(
        <Button loading loadingLabel="Saving">
          Save
        </Button>,
      );
      expect(screen.getByRole('button').textContent).toBe('SavingSave');
    });

    it('has no aria-busy and no spinner when not loading', () => {
      render(<Button loadingLabel="Saving">Save</Button>);
      const button = screen.getByRole('button');
      expect(button).not.toHaveAttribute('aria-busy');
      expect(screen.queryByRole('status')).not.toBeInTheDocument();
    });
  });

  describe('keyboard and focus', () => {
    it('receives focus by Tab and activates with Enter and Space', async () => {
      const onClick = vi.fn();
      const user = userEvent.setup();
      render(<Button onClick={onClick}>Action</Button>);
      await user.tab();
      const button = screen.getByRole('button');
      expect(button).toHaveFocus();
      await user.keyboard('{Enter}');
      await user.keyboard(' ');
      expect(onClick).toHaveBeenCalledTimes(2);
    });

    it('is skipped by Tab when disabled', async () => {
      const user = userEvent.setup();
      render(<Button disabled>Action</Button>);
      await user.tab();
      expect(screen.getByRole('button')).not.toHaveFocus();
    });

    it('declares a visible focus style and a disabled style', () => {
      render(<Button>Action</Button>);
      expect(screen.getByRole('button')).toHaveClass(
        'focus-visible:outline-2',
        'focus-visible:outline-offset-2',
        'disabled:opacity-50',
        'disabled:cursor-not-allowed',
      );
    });
  });

  it('forwards the ref and appends className last', () => {
    const ref = createRef<HTMLButtonElement>();
    render(
      <Button ref={ref} className="custom">
        Action
      </Button>,
    );
    expect(ref.current).toBeInstanceOf(HTMLButtonElement);
    expect(ref.current?.className.endsWith('custom')).toBe(true);
  });

  describe('accessibility (axe)', () => {
    it.each(['primary', 'secondary', 'danger'] as const)(
      'has no violation in the %s variant',
      async (variant) => {
        const { container } = render(<Button variant={variant}>Action</Button>);
        expect(await axe(container)).toHaveNoViolations();
      },
    );

    it('has no violation when disabled', async () => {
      const { container } = render(<Button disabled>Action</Button>);
      expect(await axe(container)).toHaveNoViolations();
    });

    it('has no violation when loading', async () => {
      const { container } = render(
        <Button loading loadingLabel="Saving">
          Save
        </Button>,
      );
      expect(await axe(container)).toHaveNoViolations();
    });

    it('negative control: a button without a name is reported', async () => {
      const { container } = render(<Button />);
      const results = await axe(container);
      expect(results.violations.map((v) => v.id)).toContain('button-name');
    });
  });
});
