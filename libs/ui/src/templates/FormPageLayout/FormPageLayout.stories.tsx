import type { Meta, StoryObj } from '@storybook/react-vite';
import { Button } from '../../atoms/Button';
import { TextInput } from '../../atoms/TextInput';
import { FormField } from '../../molecules/FormField';
import { FormPageLayout } from './FormPageLayout';

const meta = {
  title: 'Templates/FormPageLayout',
  component: FormPageLayout,
  args: {
    title: 'Cadastrar imóvel',
    description: 'Preencha os dados básicos do imóvel.',
    children: (
      <FormField label="Endereço" required>
        {(control) => <TextInput {...control} />}
      </FormField>
    ),
    actions: (
      <>
        <Button variant="secondary">Cancelar</Button>
        <Button>Salvar</Button>
      </>
    ),
  },
  argTypes: {
    headingLevel: { control: 'inline-radio', options: ['h1', 'h2', 'h3'] },
    children: { control: false },
    actions: { control: false },
  },
  parameters: { layout: 'fullscreen' },
} satisfies Meta<typeof FormPageLayout>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
export const WithoutActions: Story = { args: { actions: undefined } };
export const WithoutDescription: Story = { args: { description: undefined } };
