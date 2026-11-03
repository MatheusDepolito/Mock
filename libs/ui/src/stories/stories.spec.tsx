import { composeStories } from '@storybook/react-vite';
import { act, render } from '@testing-library/react';
import { axe } from 'jest-axe';
import type { ComponentType } from 'react';

type StoriesModule = Parameters<typeof composeStories>[0];

type PlayableStory = ComponentType & {
  play?: (context: { canvasElement: HTMLElement }) => Promise<void>;
};

// Every `*.stories.tsx` of the library, loaded eagerly.
const modules = import.meta.glob<StoriesModule>('../**/*.stories.tsx', {
  eager: true,
});

const entries = Object.entries(modules).sort(([a], [b]) => a.localeCompare(b));

describe('stories (smoke + accessibility)', () => {
  it('finds the stories of every layer, so the suite can never pass empty', () => {
    const paths = entries.map(([path]) => path);
    expect(paths.length).toBeGreaterThanOrEqual(18);
    for (const layer of [
      '/atoms/',
      '/molecules/',
      '/organisms/',
      '/templates/',
      'Tokens.stories.tsx',
    ]) {
      expect(
        paths.some((path) => path.includes(layer)),
        layer,
      ).toBe(true);
    }
  });

  describe.each(entries)('%s', (_path, storiesModule) => {
    const stories = Object.entries(
      composeStories(storiesModule),
    ) as unknown as Array<[string, PlayableStory]>;

    it('exports at least one story', () => {
      expect(stories.length).toBeGreaterThan(0);
    });

    // Stories with a `play` function (such as the open drawer) are played; the
    // result is checked in `document.body` when something is rendered in a
    // portal (open Dialog, drawer), and in the rendered container otherwise.
    it.each(stories)(
      '%s renders without accessibility violations',
      async (_name, Story) => {
        const { baseElement, container } = render(<Story />);
        await Story.play?.({ canvasElement: container });
        await act(async () => undefined);
        const inPortal = baseElement.querySelector('[role="dialog"]') !== null;
        expect(
          await axe(inPortal ? baseElement : container),
        ).toHaveNoViolations();
      },
    );
  });

  it('plays the drawer story: it ends with the drawer open, in a portal', async () => {
    const shell = entries.find(([path]) => path.includes('AppShell.stories'));
    expect(shell).toBeDefined();
    const stories = composeStories(shell![1]) as unknown as Record<
      string,
      PlayableStory
    >;
    const MobileDrawer = stories['MobileDrawer'];
    if (MobileDrawer === undefined)
      throw new Error('MobileDrawer story missing');
    const { container, baseElement } = render(<MobileDrawer />);
    expect(baseElement.querySelector('[role="dialog"]')).toBeNull();
    await MobileDrawer.play?.({ canvasElement: container });
    await act(async () => undefined);
    expect(baseElement.querySelector('[role="dialog"]')).not.toBeNull();
  });

  it('negative control: markup with a violation is reported by axe', async () => {
    document.body.innerHTML = '<img src="x.png">';
    const results = await axe(document.body);
    expect(results.violations.map((v) => v.id)).toContain('image-alt');
    document.body.innerHTML = '';
  });
});
