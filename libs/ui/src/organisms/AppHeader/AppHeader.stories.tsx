import type { Meta, StoryObj } from '@storybook/react-vite';
import { Button } from '../../atoms/Button';
import { AppHeader } from './AppHeader';

const noop = (): void => undefined;

const meta = {
  title: 'Organisms/AppHeader',
  component: AppHeader,
  args: { brand: <strong>Mockp</strong> },
  argTypes: { brand: { control: false }, children: { control: false } },
  parameters: { layout: 'fullscreen' },
} satisfies Meta<typeof AppHeader>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
export const WithActions: Story = {
  args: { children: <Button size="sm">Entrar</Button> },
};
/** The menu button only appears below the `lg` breakpoint. */
export const WithMenuButton: Story = {
  args: { onMenuClick: noop, menuLabel: 'Abrir menu' },
  globals: { viewport: { value: 'iphonex', isRotated: false } },
};
