import { render, screen } from '@testing-library/react';
import { axe } from 'jest-axe';
import { createRef } from 'react';
import { Button } from '../../atoms/Button';
import { FormPageLayout } from './FormPageLayout';

describe('FormPageLayout', () => {
  it('renders the title as an h1 by default, and the form', () => {
    render(
      <FormPageLayout title="New property">
        <form aria-label="Property" />
      </FormPageLayout>,
    );
    expect(
      screen.getByRole('heading', { level: 1, name: 'New property' }),
    ).toBeInTheDocument();
    expect(screen.getByRole('form', { name: 'Property' })).toBeInTheDocument();
  });

  it.each([1, 2, 3] as const)('supports heading level %s', (level) => {
    render(
      <FormPageLayout
        title="T"
        headingLevel={`h${level}` as 'h1' | 'h2' | 'h3'}
      >
        x
      </FormPageLayout>,
    );
    expect(screen.getByRole('heading', { level })).toBeInTheDocument();
  });

  it('shows the description only when provided', () => {
    const { container, rerender } = render(
      <FormPageLayout title="T">x</FormPageLayout>,
    );
    expect(container.querySelector('p')).toBeNull();
    rerender(
      <FormPageLayout title="T" description="Fill in the data">
        x
      </FormPageLayout>,
    );
    expect(screen.getByText('Fill in the data')).toBeInTheDocument();
  });

  it('shows the actions only when provided', () => {
    const { rerender } = render(<FormPageLayout title="T">x</FormPageLayout>);
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
    rerender(
      <FormPageLayout title="T" actions={<Button>Save</Button>}>
        x
      </FormPageLayout>,
    );
    expect(screen.getByRole('button', { name: 'Save' })).toBeInTheDocument();
  });

  it('uses the Container and a narrow centred column', () => {
    const { container } = render(<FormPageLayout title="T">x</FormPageLayout>);
    expect(container.firstElementChild).toHaveClass(
      'mx-auto',
      'max-w-screen-lg',
      'px-4',
    );
    expect(container.querySelector('.max-w-screen-md')).toHaveClass('mx-auto');
  });

  it('has no fixed interface text', () => {
    const { container } = render(<FormPageLayout title="T">C</FormPageLayout>);
    expect(container.textContent).toBe('TC');
  });

  it('forwards the ref and the native attributes', () => {
    const ref = createRef<HTMLElement>();
    render(
      <FormPageLayout ref={ref} title="T" data-testid="page" className="custom">
        x
      </FormPageLayout>,
    );
    expect(ref.current).toBe(screen.getByTestId('page'));
    expect(ref.current?.className.endsWith('custom')).toBe(true);
  });

  it.each([
    ['minimal', {}],
    ['complete', { description: 'Help text', actions: <Button>Save</Button> }],
  ] as const)('has no accessibility violation (%s)', async (_name, props) => {
    const { container } = render(
      <main>
        <FormPageLayout title="Title" {...props}>
          <p>Form</p>
        </FormPageLayout>
      </main>,
    );
    expect(await axe(container)).toHaveNoViolations();
  });
});
