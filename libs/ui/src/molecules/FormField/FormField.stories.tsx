import type { Meta, StoryObj } from '@storybook/react-vite';
import { TextInput } from '../../atoms/TextInput';
import { FormField } from './FormField';

const meta = {
  title: 'Molecules/FormField',
  component: FormField,
  args: {
    label: 'E-mail',
    children: (control) => <TextInput {...control} type="email" />,
  },
  argTypes: {
    required: { control: 'boolean' },
    hint: { control: 'text' },
    error: { control: 'text' },
    announceError: { control: 'boolean' },
    children: { control: false },
  },
} satisfies Meta<typeof FormField>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
export const WithHint: Story = {
  args: { hint: 'Usaremos este e-mail para enviar o comprovante.' },
};
export const WithError: Story = {
  args: { error: 'Informe um e-mail válido.', announceError: true },
};
export const Required: Story = { args: { required: true } };
export const WithHintAndError: Story = {
  args: {
    hint: 'Usaremos este e-mail para enviar o comprovante.',
    error: 'Informe um e-mail válido.',
  },
};
