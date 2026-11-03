/// <reference types="node" />
import { readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { exportedComponents, missingStories } from './story-coverage';

const SRC = join(import.meta.dirname, '..');

const hasFile = (storyPath: string) => {
  try {
    return statSync(join(SRC, storyPath)).isFile();
  } catch {
    return false;
  }
};

describe('exportedComponents', () => {
  it('reads value exports and ignores type exports', () => {
    const source = [
      "export { Button } from './atoms/Button';",
      "export type { ButtonProps } from './atoms/Button';",
      "export {\n  Alpha,\n  Beta,\n} from './molecules/Alpha';",
      "export type { NavItem } from './organisms/nav-types';",
    ].join('\n');
    expect(exportedComponents(source)).toEqual([
      { name: 'Button', folder: 'atoms/Button' },
      { name: 'Alpha', folder: 'molecules/Alpha' },
      { name: 'Beta', folder: 'molecules/Alpha' },
    ]);
  });
});

describe('story coverage', () => {
  it('every component exported by src/index.ts has a stories file', () => {
    const components = exportedComponents(
      readFileSync(join(SRC, 'index.ts'), 'utf8'),
    );
    expect(components.length).toBeGreaterThanOrEqual(17);
    expect(missingStories(components, hasFile)).toEqual([]);
  });

  it('negative control: a component without a story is reported by name', () => {
    const index = [
      "export { Button } from './atoms/Button';",
      "export { Ghost } from './atoms/Ghost';",
    ].join('\n');
    expect(missingStories(exportedComponents(index), hasFile)).toEqual([
      'Ghost',
    ]);
  });
});
