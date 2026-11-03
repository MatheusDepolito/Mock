import { IconBuilding, IconHome, IconUsers } from '@tabler/icons-react';
import type { Meta, StoryObj } from '@storybook/react-vite';
import type { NavItem } from '../nav-types';
import { SideNav } from './SideNav';

const ITEMS: NavItem[] = [
  { id: 'inicio', label: 'Início', href: '#inicio', current: true },
  { id: 'imoveis', label: 'Imóveis', href: '#imoveis' },
  { id: 'clientes', label: 'Clientes', href: '#clientes' },
];

const ITEMS_WITH_ICONS: NavItem[] = [
  { ...ITEMS[0]!, icon: IconHome },
  { ...ITEMS[1]!, icon: IconBuilding },
  { ...ITEMS[2]!, icon: IconUsers },
];

const meta = {
  title: 'Organisms/SideNav',
  component: SideNav,
  args: { label: 'Navegação principal', items: ITEMS },
  argTypes: { items: { control: false }, renderLink: { control: false } },
} satisfies Meta<typeof SideNav>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
export const WithIcons: Story = { args: { items: ITEMS_WITH_ICONS } };
