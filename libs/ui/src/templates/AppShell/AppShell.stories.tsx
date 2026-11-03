import { IconBuilding, IconHome, IconUsers } from '@tabler/icons-react';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { userEvent, within } from 'storybook/test';
import { Button } from '../../atoms/Button';
import { AppHeader } from '../../organisms/AppHeader';
import type { NavItem } from '../../organisms/nav-types';
import { SideNav } from '../../organisms/SideNav';
import { AppShell } from './AppShell';

const ITEMS: NavItem[] = [
  {
    id: 'inicio',
    label: 'Início',
    href: '#inicio',
    current: true,
    icon: IconHome,
  },
  { id: 'imoveis', label: 'Imóveis', href: '#imoveis', icon: IconBuilding },
  { id: 'clientes', label: 'Clientes', href: '#clientes', icon: IconUsers },
];

const content = (
  <div className="p-6">
    <h1 className="text-2xl font-medium text-content">Painel</h1>
    <p className="text-content-muted">Conteúdo da página.</p>
  </div>
);

const meta = {
  title: 'Templates/AppShell',
  component: AppShell,
  args: {
    skipLinkLabel: 'Pular para o conteúdo',
    header: <AppHeader brand={<strong>Mockp</strong>} />,
    children: content,
  },
  argTypes: {
    header: { control: false },
    sidebar: { control: false },
    children: { control: false },
  },
  parameters: { layout: 'fullscreen' },
} satisfies Meta<typeof AppShell>;

export default meta;
type Story = StoryObj<typeof meta>;

export const WithoutSidebar: Story = {};

/** From `lg` up the sidebar is fixed on the left. */
export const WithSidebar: Story = {
  render: (args) => (
    <AppShell
      skipLinkLabel={args.skipLinkLabel}
      menuLabel="Abrir menu"
      closeLabel="Fechar menu"
      header={(menu) => (
        <AppHeader brand={<strong>Mockp</strong>} {...menu}>
          <Button size="sm">Entrar</Button>
        </AppHeader>
      )}
      sidebar={<SideNav label="Navegação principal" items={ITEMS} />}
    >
      {content}
    </AppShell>
  ),
};

/** Below `lg` the sidebar becomes a drawer, opened by the menu button. */
export const MobileDrawer: Story = {
  ...WithSidebar,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole('button', { name: 'Abrir menu' }));
  },
  globals: { viewport: { value: 'iphonex', isRotated: false } },
};
