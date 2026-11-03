export interface ExportedComponent {
  name: string;
  /** Path of the component folder relative to `src`, e.g. `atoms/Button`. */
  folder: string;
}

/**
 * Components (value exports) re-exported by `src/index.ts`:
 * `export { Name } from './layer/Name';`. Type-only exports are ignored.
 */
export function exportedComponents(indexSource: string): ExportedComponent[] {
  const found: ExportedComponent[] = [];
  const pattern = /^export\s*\{([^}]*)\}\s*from\s*'\.\/(\w+)\/(\w+)';/gm;
  for (const match of indexSource.matchAll(pattern)) {
    const [, names, layer, folder] = match;
    if (names === undefined || layer === undefined || folder === undefined) {
      continue;
    }
    for (const name of names.split(',').map((n) => n.trim())) {
      if (name !== '') found.push({ name, folder: `${layer}/${folder}` });
    }
  }
  return found;
}

/** Names of the exported components that have no `*.stories.tsx` file. */
export function missingStories(
  components: ReadonlyArray<ExportedComponent>,
  hasStoryFile: (storyPath: string) => boolean,
): string[] {
  return components
    .filter(
      ({ name, folder }) => !hasStoryFile(`${folder}/${name}.stories.tsx`),
    )
    .map(({ name }) => name);
}
