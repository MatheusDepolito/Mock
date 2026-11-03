import type { Meta, StoryObj } from '@storybook/react-vite';
import { FieldError } from './FieldError';

const meta = {
  title: 'Atoms/FieldError',
  component: FieldError,
  args: { id: 'email-erro', children: 'Informe um e-mail válido.' },
  argTypes: { announce: { control: 'boolean' } },
} satisfies Meta<typeof FieldError>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
export const Announced: Story = { args: { announce: true } };
