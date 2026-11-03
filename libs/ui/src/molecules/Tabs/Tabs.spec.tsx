import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { axe } from 'jest-axe';
import { Tabs } from './Tabs';
import type { TabItem } from './Tabs';

const TABS: TabItem[] = [
  { id: 'a', label: 'First', content: 'Content A' },
  { id: 'b', label: 'Second', content: 'Content B' },
  { id: 'c', label: 'Third', content: 'Content C' },
];

describe('Tabs', () => {
  it('exposes a named tablist, tabs and a single tabpanel', () => {
    render(<Tabs tabs={TABS} label="Sections" />);
    expect(
      screen.getByRole('tablist', { name: 'Sections' }),
    ).toBeInTheDocument();
    expect(screen.getAllByRole('tab')).toHaveLength(3);
    expect(screen.getAllByRole('tabpanel')).toHaveLength(1);
  });

  it('selects the first tab by default and shows only its panel', () => {
    render(<Tabs tabs={TABS} label="Sections" />);
    expect(screen.getByRole('tab', { name: 'First' })).toHaveAttribute(
      'aria-selected',
      'true',
    );
    expect(screen.getByRole('tab', { name: 'Second' })).toHaveAttribute(
      'aria-selected',
      'false',
    );
    expect(screen.getByRole('tabpanel')).toHaveTextContent('Content A');
    expect(screen.queryByText('Content B')).not.toBeInTheDocument();
  });

  it('honours defaultIndex', () => {
    render(<Tabs tabs={TABS} label="Sections" defaultIndex={2} />);
    expect(screen.getByRole('tab', { name: 'Third' })).toHaveAttribute(
      'aria-selected',
      'true',
    );
    expect(screen.getByRole('tabpanel')).toHaveTextContent('Content C');
  });

  it('selects a tab by click and keeps a single active panel', async () => {
    render(<Tabs tabs={TABS} label="Sections" />);
    await userEvent.click(screen.getByRole('tab', { name: 'Second' }));
    expect(screen.getByRole('tab', { name: 'Second' })).toHaveAttribute(
      'aria-selected',
      'true',
    );
    expect(screen.getAllByRole('tabpanel')).toHaveLength(1);
    expect(screen.getByRole('tabpanel')).toHaveTextContent('Content B');
  });

  it('moves with the arrow keys, Home and End', async () => {
    const user = userEvent.setup();
    render(<Tabs tabs={TABS} label="Sections" />);
    await user.tab();
    expect(screen.getByRole('tab', { name: 'First' })).toHaveFocus();
    await user.keyboard('{ArrowRight}');
    expect(screen.getByRole('tab', { name: 'Second' })).toHaveFocus();
    expect(screen.getByRole('tab', { name: 'Second' })).toHaveAttribute(
      'aria-selected',
      'true',
    );
    await user.keyboard('{End}');
    expect(screen.getByRole('tab', { name: 'Third' })).toHaveAttribute(
      'aria-selected',
      'true',
    );
    expect(screen.getByRole('tabpanel')).toHaveTextContent('Content C');
    await user.keyboard('{ArrowLeft}');
    expect(screen.getByRole('tab', { name: 'Second' })).toHaveFocus();
    await user.keyboard('{Home}');
    expect(screen.getByRole('tab', { name: 'First' })).toHaveAttribute(
      'aria-selected',
      'true',
    );
  });

  it('links each tab to its panel (aria-controls and aria-labelledby)', () => {
    render(<Tabs tabs={TABS} label="Sections" />);
    const tab = screen.getByRole('tab', { name: 'First' });
    const panel = screen.getByRole('tabpanel');
    expect(tab).toHaveAttribute('aria-controls', panel.id);
    expect(panel).toHaveAttribute('aria-labelledby', tab.id);
  });

  it('calls onChange with the new index', async () => {
    const onChange = vi.fn();
    render(<Tabs tabs={TABS} label="Sections" onChange={onChange} />);
    await userEvent.click(screen.getByRole('tab', { name: 'Third' }));
    expect(onChange).toHaveBeenCalledWith(2);
  });

  it('is controlled by selectedIndex', async () => {
    const onChange = vi.fn();
    const { rerender } = render(
      <Tabs
        tabs={TABS}
        label="Sections"
        selectedIndex={1}
        onChange={onChange}
      />,
    );
    expect(screen.getByRole('tabpanel')).toHaveTextContent('Content B');
    await userEvent.click(screen.getByRole('tab', { name: 'Third' }));
    expect(onChange).toHaveBeenCalledWith(2);
    expect(screen.getByRole('tabpanel')).toHaveTextContent('Content B');
    rerender(
      <Tabs
        tabs={TABS}
        label="Sections"
        selectedIndex={2}
        onChange={onChange}
      />,
    );
    expect(screen.getByRole('tabpanel')).toHaveTextContent('Content C');
  });

  it('declares a selected style and a visible focus style', () => {
    render(<Tabs tabs={TABS} label="Sections" />);
    expect(screen.getByRole('tab', { name: 'First' })).toHaveClass(
      'data-selected:border-primary',
      'data-selected:text-primary',
      'focus-visible:outline-2',
    );
  });

  it('has no fixed interface text', () => {
    const { container } = render(
      <Tabs tabs={TABS.slice(0, 1)} label="Sections" />,
    );
    expect(container.textContent).toBe('FirstContent A');
  });

  it('has no accessibility violation', async () => {
    const { container } = render(<Tabs tabs={TABS} label="Sections" />);
    expect(await axe(container)).toHaveNoViolations();
  });

  it('negative control: a tab outside a tablist is reported', async () => {
    const { container } = render(
      <div>
        <button role="tab" aria-selected="true" type="button">
          One
        </button>
      </div>,
    );
    const results = await axe(container);
    expect(results.violations.map((v) => v.id)).toContain(
      'aria-required-parent',
    );
  });
});
