import type { ComponentPropsWithoutRef, ReactNode, Ref } from 'react';
import { Container } from '../../atoms/Container';

export type FormPageHeading = 'h1' | 'h2' | 'h3';

export interface FormPageLayoutProps extends Omit<
  ComponentPropsWithoutRef<'div'>,
  'title'
> {
  title: ReactNode;
  /** Heading level of the title; the consumer knows the page outline. */
  headingLevel?: FormPageHeading;
  description?: ReactNode;
  /** Form actions (buttons), aligned to the end below the form. */
  actions?: ReactNode;
  ref?: Ref<HTMLElement>;
}

/** Generic page for a form: narrow centred column; no form logic inside. */
export function FormPageLayout({
  title,
  headingLevel = 'h1',
  description,
  actions,
  children,
  ref,
  ...rest
}: FormPageLayoutProps) {
  const Heading = headingLevel;
  return (
    <Container {...(ref !== undefined ? { ref } : {})} {...rest}>
      <div className="mx-auto flex max-w-screen-md flex-col gap-6 py-8">
        <div className="flex flex-col gap-2">
          <Heading className="text-2xl font-medium text-content">
            {title}
          </Heading>
          {description !== undefined ? (
            <p className="text-base text-content-muted">{description}</p>
          ) : null}
        </div>
        <div>{children}</div>
        {actions !== undefined ? (
          <div className="flex justify-end gap-3">{actions}</div>
        ) : null}
      </div>
    </Container>
  );
}
