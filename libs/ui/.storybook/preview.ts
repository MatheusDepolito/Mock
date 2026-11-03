import type { Preview } from '@storybook/react-vite';
import '../src/styles/styles.css';

const preview: Preview = {
  parameters: {
    controls: { expanded: true },
    a11y: { test: 'error' },
  },
};

export default preview;
