import type { Meta, StoryObj } from '@storybook/react-vite';
import { Container } from './Container';

const meta = {
  title: 'Atoms/Container',
  component: Container,
  args: {
    children: (
      <p className="border border-border bg-surface-raised p-4 text-content">
        Conteúdo limitado pela largura máxima e pelo espaçamento horizontal
        responsivo do contêiner.
      </p>
    ),
  },
  argTypes: {
    as: { control: 'inline-radio', options: ['div', 'main', 'section'] },
  },
} satisfies Meta<typeof Container>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
export const AsMain: Story = { args: { as: 'main' } };
export const AsSection: Story = { args: { as: 'section' } };
