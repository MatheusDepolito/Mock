import type { Meta, StoryObj } from '@storybook/react-vite';
import { Alert } from './Alert';

const meta = {
  title: 'Molecules/Alert',
  component: Alert,
  args: { title: 'Atenção', children: 'Revise os dados antes de continuar.' },
  argTypes: {
    tone: { control: 'inline-radio', options: ['info', 'success', 'danger'] },
  },
} satisfies Meta<typeof Alert>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Info: Story = { args: { tone: 'info' } };
export const Success: Story = {
  args: { tone: 'success', title: 'Salvo', children: 'Imóvel cadastrado.' },
};
export const Danger: Story = {
  args: {
    tone: 'danger',
    title: 'Erro',
    children: 'Não foi possível salvar. Tente novamente.',
  },
};
export const WithoutTitle: Story = { args: { title: undefined } };
