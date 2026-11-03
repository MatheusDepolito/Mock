import type { Meta, StoryObj } from '@storybook/react-vite';
import { Tabs } from './Tabs';

const meta = {
  title: 'Molecules/Tabs',
  component: Tabs,
  args: {
    label: 'Seções do imóvel',
    tabs: [
      { id: 'detalhes', label: 'Detalhes', content: 'Área, quartos e vagas.' },
      { id: 'fotos', label: 'Fotos', content: 'Galeria de fotos do imóvel.' },
      { id: 'historico', label: 'Histórico', content: 'Visitas e propostas.' },
    ],
  },
  argTypes: { tabs: { control: false } },
} satisfies Meta<typeof Tabs>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
export const SecondTabSelected: Story = { args: { defaultIndex: 1 } };
