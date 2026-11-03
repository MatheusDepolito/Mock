import { render, screen } from '@testing-library/react';
import { axe } from 'jest-axe';
import { createRef } from 'react';
import { Container } from './Container';

describe('Container', () => {
  it('renders a div by default', () => {
    render(<Container data-testid="c">Content</Container>);
    expect(screen.getByTestId('c').tagName).toBe('DIV');
    expect(screen.getByTestId('c')).toHaveTextContent('Content');
  });

  it.each([
    ['div', 'DIV'],
    ['main', 'MAIN'],
    ['section', 'SECTION'],
  ] as const)('renders %s when asked', (as, tagName) => {
    render(
      <Container as={as} data-testid="c">
        Content
      </Container>,
    );
    expect(screen.getByTestId('c').tagName).toBe(tagName);
  });

  it('exposes the main landmark', () => {
    render(<Container as="main">Content</Container>);
    expect(screen.getByRole('main')).toBeInTheDocument();
  });

  it('has a responsive max width and padding from the breakpoint contract', () => {
    render(<Container data-testid="c" />);
    expect(screen.getByTestId('c')).toHaveClass(
      'mx-auto',
      'w-full',
      'max-w-screen-lg',
      'px-4',
      'sm:px-6',
      'lg:px-8',
    );
  });

  it('has no fixed interface text', () => {
    render(<Container data-testid="c" />);
    expect(screen.getByTestId('c').textContent).toBe('');
  });

  it('forwards the ref and appends className last', () => {
    const ref = createRef<HTMLElement>();
    render(
      <Container as="section" ref={ref} className="custom">
        Content
      </Container>,
    );
    expect(ref.current?.tagName).toBe('SECTION');
    expect(ref.current?.className.endsWith('custom')).toBe(true);
  });

  it.each(['div', 'main', 'section'] as const)(
    'has no accessibility violation as %s',
    async (as) => {
      const { container } = render(
        <Container as={as}>
          <p>Content</p>
        </Container>,
      );
      expect(await axe(container)).toHaveNoViolations();
    },
  );
});
