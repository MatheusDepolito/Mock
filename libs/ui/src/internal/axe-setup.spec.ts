import { axe } from 'jest-axe';

describe('jest-axe matcher (Vitest)', () => {
  it('accepts markup without violations', async () => {
    document.body.innerHTML =
      '<main><button type="button">Save</button></main>';
    expect(await axe(document.body)).toHaveNoViolations();
  });

  it('negative control: reports an image without alt and a nameless button', async () => {
    document.body.innerHTML =
      '<main><img src="x.png"><button type="button"></button></main>';
    const results = await axe(document.body);
    const ids = results.violations.map((violation) => violation.id);
    expect(ids).toContain('image-alt');
    expect(ids).toContain('button-name');
    expect(() => expect(results).toHaveNoViolations()).toThrow();
  });
});
