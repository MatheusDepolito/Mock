import type { Meta, StoryObj } from '@storybook/react-vite';
import { useState } from 'react';
import { Button } from '../../atoms/Button';
import { Dialog } from './Dialog';

const noop = (): void => undefined;

const meta = {
  title: 'Molecules/Dialog',
  component: Dialog,
  args: {
    open: true,
    onClose: noop,
    title: 'Excluir imóvel',
    description: 'Esta ação não pode ser desfeita.',
    closeLabel: 'Fechar',
    children: <p>O anúncio e as fotos associadas serão removidos.</p>,
    actions: (
      <>
        <Button variant="secondary">Cancelar</Button>
        <Button variant="danger">Excluir</Button>
      </>
    ),
  },
  argTypes: { open: { control: 'boolean' } },
} satisfies Meta<typeof Dialog>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Open: Story = {};

export const WithoutDescription: Story = {
  args: { description: undefined, actions: undefined },
};

function InteractiveExample() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button onClick={() => setOpen(true)}>Abrir diálogo</Button>
      <Dialog
        open={open}
        onClose={() => setOpen(false)}
        title="Confirmar exclusão"
        description="Deseja realmente excluir este imóvel?"
        closeLabel="Fechar"
        actions={
          <Button variant="danger" onClick={() => setOpen(false)}>
            Excluir
          </Button>
        }
      />
    </>
  );
}

/** Closed at first: open it with the button, close with Esc, the backdrop or the X. */
export const Interactive: Story = {
  args: { open: false },
  render: () => <InteractiveExample />,
};
