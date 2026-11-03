/// <reference types="node" />
import { act, renderHook } from '@testing-library/react';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { BREAKPOINT_LG, DESKTOP_QUERY, useMediaQuery } from './use-media-query';

class FakeMediaQueryList {
  matches: boolean;
  readonly listeners = new Set<(event: MediaQueryListEvent) => void>();
  readonly addEventListener = vi.fn(
    (_type: string, listener: (event: MediaQueryListEvent) => void) => {
      this.listeners.add(listener);
    },
  );
  readonly removeEventListener = vi.fn(
    (_type: string, listener: (event: MediaQueryListEvent) => void) => {
      this.listeners.delete(listener);
    },
  );

  constructor(matches: boolean) {
    this.matches = matches;
  }

  change(matches: boolean) {
    this.matches = matches;
    act(() => {
      this.listeners.forEach((listener) =>
        listener({ matches } as MediaQueryListEvent),
      );
    });
  }
}

const original = Object.getOwnPropertyDescriptor(window, 'matchMedia');

function install(list: FakeMediaQueryList) {
  const matchMedia = vi.fn(() => list as unknown as MediaQueryList);
  Object.defineProperty(window, 'matchMedia', {
    configurable: true,
    writable: true,
    value: matchMedia,
  });
  return matchMedia;
}

afterEach(() => {
  if (original) Object.defineProperty(window, 'matchMedia', original);
  else Reflect.deleteProperty(window, 'matchMedia');
});

describe('BREAKPOINT_LG', () => {
  it('is the single source of the lg query', () => {
    expect(DESKTOP_QUERY).toBe(`(min-width: ${BREAKPOINT_LG})`);
  });

  it('equals --breakpoint-lg of tokens.css, so the two cannot diverge', () => {
    const css = readFileSync(
      join(import.meta.dirname, '..', 'styles', 'tokens.css'),
      'utf8',
    );
    const match = /--breakpoint-lg:\s*([^;]+);/.exec(css);
    expect(match?.[1]?.trim()).toBe(BREAKPOINT_LG);
  });
});

describe('useMediaQuery', () => {
  it('is false and does not throw without window.matchMedia (jsdom, server)', () => {
    expect(typeof window.matchMedia).toBe('undefined');
    const { result } = renderHook(() => useMediaQuery(DESKTOP_QUERY));
    expect(result.current).toBe(false);
  });

  it('starts with the current match of the query', () => {
    const matchMedia = install(new FakeMediaQueryList(true));
    const { result } = renderHook(() => useMediaQuery(DESKTOP_QUERY));
    expect(result.current).toBe(true);
    expect(matchMedia).toHaveBeenCalledWith('(min-width: 64rem)');
  });

  it('follows the change events of the query', () => {
    const list = new FakeMediaQueryList(false);
    install(list);
    const { result } = renderHook(() => useMediaQuery(DESKTOP_QUERY));
    expect(result.current).toBe(false);
    list.change(true);
    expect(result.current).toBe(true);
    list.change(false);
    expect(result.current).toBe(false);
  });

  it('removes its listener on unmount', () => {
    const list = new FakeMediaQueryList(false);
    install(list);
    const { unmount } = renderHook(() => useMediaQuery(DESKTOP_QUERY));
    expect(list.listeners.size).toBe(1);
    unmount();
    expect(list.listeners.size).toBe(0);
    expect(list.removeEventListener).toHaveBeenCalledTimes(1);
  });
});
