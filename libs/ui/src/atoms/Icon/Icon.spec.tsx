import { render, screen } from '@testing-library/react';
import { axe } from 'jest-axe';
import { IconCheck } from '@tabler/icons-react';
import { Icon } from './Icon';

describe('Icon', () => {
  it('is a meaningful image when it has a label', () => {
    render(<Icon icon={IconCheck} label="Done" />);
    const icon = screen.getByRole('img', { name: 'Done' });
    expect(icon.tagName.toLowerCase()).toBe('svg');
    expect(icon).not.toHaveAttribute('aria-hidden');
  });

  it('is decorative (aria-hidden, no role) without a label', () => {
    const { container } = render(<Icon icon={IconCheck} />);
    const svg = container.querySelector('svg');
    expect(svg).toHaveAttribute('aria-hidden', 'true');
    expect(svg).not.toHaveAttribute('role');
    expect(screen.queryByRole('img')).not.toBeInTheDocument();
  });

  it.each([
    ['sm', 'h-4', 'w-4'],
    ['md', 'h-5', 'w-5'],
    ['lg', 'h-6', 'w-6'],
  ] as const)('applies the %s size', (size, h, w) => {
    const { container } = render(<Icon icon={IconCheck} size={size} />);
    expect(container.querySelector('svg')).toHaveClass(h, w);
  });

  it('uses md by default and appends className last', () => {
    const { container } = render(<Icon icon={IconCheck} className="custom" />);
    const svg = container.querySelector('svg');
    expect(svg).toHaveClass('h-5', 'w-5', 'custom');
    expect(svg?.getAttribute('class')?.endsWith('custom')).toBe(true);
  });

  it('renders whatever icon component it receives (no catalog inside the library)', () => {
    const Custom = ({ className }: { className?: string }) => (
      <svg data-testid="custom" className={className} />
    );
    render(<Icon icon={Custom} />);
    expect(screen.getByTestId('custom')).toHaveClass('h-5');
  });

  it('has no fixed interface text', () => {
    const { container } = render(<Icon icon={IconCheck} />);
    expect(container.textContent).toBe('');
  });

  it.each([
    ['with a label', { label: 'Done' }],
    ['decorative', {}],
  ] as const)('has no accessibility violation (%s)', async (_name, props) => {
    const { container } = render(
      <button type="button" aria-label="Confirm">
        <Icon icon={IconCheck} {...props} />
      </button>,
    );
    expect(await axe(container)).toHaveNoViolations();
  });

  it('negative control: an image role without a name is reported', async () => {
    const { container } = render(<svg role="img" />);
    const results = await axe(container);
    expect(results.violations.map((v) => v.id)).toContain('svg-img-alt');
  });
});
