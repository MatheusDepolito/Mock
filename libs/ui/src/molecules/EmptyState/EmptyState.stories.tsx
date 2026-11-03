import { IconInbox } from '@tabler/icons-react';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { Button } from '../../atoms/Button';
import { EmptyState } from './EmptyState';

const meta = {
  title: 'Molecules/EmptyState',
  component: EmptyState,
  args: {
    icon: IconInbox,
    title: 'Nenhum imóvel encontrado',
    description: 'Ajuste os filtros ou cadastre um novo imóvel.',
  },
  argTypes: {
    icon: { control: false },
    action: { control: false },
    headingLevel: { control: 'inline-radio', options: ['h2', 'h3', 'h4'] },
  },
} satisfies Meta<typeof EmptyState>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
export const WithAction: Story = {
  args: { action: <Button>Cadastrar imóvel</Button> },
};
export const TitleOnly: Story = { args: { description: undefined } };
