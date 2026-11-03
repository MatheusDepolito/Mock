import type { Meta, StoryObj } from '@storybook/react-vite';
import { Badge } from './Badge';

const meta = {
  title: 'Atoms/Badge',
  component: Badge,
  args: { children: 'Disponível' },
  argTypes: {
    tone: {
      control: 'inline-radio',
      options: ['neutral', 'primary', 'success', 'danger'],
    },
  },
} satisfies Meta<typeof Badge>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Neutral: Story = { args: { tone: 'neutral' } };
export const Primary: Story = { args: { tone: 'primary', children: 'Novo' } };
export const Success: Story = {
  args: { tone: 'success', children: 'Aprovado' },
};
export const Danger: Story = {
  args: { tone: 'danger', children: 'Reprovado' },
};
