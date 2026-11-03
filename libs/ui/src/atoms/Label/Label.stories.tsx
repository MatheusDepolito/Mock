import type { Meta, StoryObj } from '@storybook/react-vite';
import { Label } from './Label';

const meta = {
  title: 'Atoms/Label',
  component: Label,
  args: { children: 'Nome completo', htmlFor: 'nome' },
  argTypes: { required: { control: 'boolean' } },
} satisfies Meta<typeof Label>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
export const Required: Story = { args: { required: true } };
