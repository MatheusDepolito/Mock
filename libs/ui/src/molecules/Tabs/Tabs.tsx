import { Tab, TabGroup, TabList, TabPanel, TabPanels } from '@headlessui/react';
import type { ReactNode } from 'react';
import { cx } from '../../internal/cx';

export interface TabItem {
  id: string;
  label: ReactNode;
  content: ReactNode;
}

export interface TabsProps {
  tabs: ReadonlyArray<TabItem>;
  /** Accessible name of the tab list; it comes from the consumer (D17). */
  label: string;
  /** Uncontrolled initial tab. */
  defaultIndex?: number;
  /** Controlled selected tab; pair it with `onChange`. */
  selectedIndex?: number;
  onChange?: (index: number) => void;
  className?: string;
}

/** Tabs over Headless UI: arrow keys, Home and End move and select the tab. */
export function Tabs({
  tabs,
  label,
  defaultIndex,
  selectedIndex,
  onChange,
  className,
}: TabsProps) {
  return (
    <TabGroup
      className={cx('font-sans', className)}
      {...(defaultIndex !== undefined ? { defaultIndex } : {})}
      {...(selectedIndex !== undefined ? { selectedIndex } : {})}
      {...(onChange !== undefined ? { onChange } : {})}
    >
      <TabList aria-label={label} className="flex gap-4 border-b border-border">
        {tabs.map((tab) => (
          <Tab
            key={tab.id}
            className="-mb-px border-b-2 border-transparent px-1 pb-2 text-sm font-medium text-content-muted focus-visible:outline-2 focus-visible:outline-primary data-selected:border-primary data-selected:text-primary"
          >
            {tab.label}
          </Tab>
        ))}
      </TabList>
      <TabPanels>
        {tabs.map((tab) => (
          <TabPanel
            key={tab.id}
            className="pt-4 text-base text-content focus-visible:outline-2 focus-visible:outline-primary"
          >
            {tab.content}
          </TabPanel>
        ))}
      </TabPanels>
    </TabGroup>
  );
}
