/// <reference types="node" />
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { SAMPLE_CLASSES } from './tokens-samples';
import { parseThemeTokens } from './tokens-parser';

const tokens = parseThemeTokens(
  readFileSync(join(import.meta.dirname, '..', 'styles', 'tokens.css'), 'utf8'),
);

describe('SAMPLE_CLASSES', () => {
  const sampled = tokens.filter((t) =>
    ['color', 'radius', 'shadow', 'font'].includes(t.group),
  );

  it('has a utility for every color, radius, shadow and font token', () => {
    expect(sampled.filter((t) => SAMPLE_CLASSES[t.name] === undefined)).toEqual(
      [],
    );
  });

  it('only lists tokens that still exist in tokens.css', () => {
    const names = new Set(tokens.map((t) => t.name));
    expect(Object.keys(SAMPLE_CLASSES).filter((n) => !names.has(n))).toEqual(
      [],
    );
  });
});
