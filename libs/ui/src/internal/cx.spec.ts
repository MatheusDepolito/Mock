import { cx } from './cx';

describe('cx', () => {
  it('joins the strings with a single space', () => {
    expect(cx('a', 'b', 'c')).toBe('a b c');
  });

  it('ignores false, null, undefined and empty strings', () => {
    expect(cx('a', false, null, undefined, '', 'b')).toBe('a b');
  });

  it('returns an empty string when nothing is left', () => {
    expect(cx()).toBe('');
    expect(cx(false, null, undefined)).toBe('');
  });

  it('keeps the order, so the last class can win', () => {
    expect(cx('base', 'variant', 'custom')).toBe('base variant custom');
  });
});
