import { createContext, useContext, type ReactNode } from 'react';

/**
 * The two things these primitives need from the surrounding application.
 *
 * Everything else here is self-contained. The theme lives in the app's settings
 * store and the clipboard helper reports through the app's toast system, so
 * importing them directly would drag app state into a presentation package and
 * make it unusable by a second app. They are injected instead.
 */
export interface UiDependencies {
  /** Resolved light/dark mode for editor and toast surfaces. */
  useThemeMode: () => 'light' | 'dark';
  /** Syntax highlighter style object for the Lua and GLSL editors. */
  useSyntaxTheme: () => Record<string, unknown>;
  /** Copy text, reporting success or failure however the app prefers. */
  copyToClipboard: (value: string) => void;
}

const fallback: UiDependencies = {
  useThemeMode: () => 'light',
  useSyntaxTheme: () => ({}),
  copyToClipboard: (value: string) => {
    void navigator.clipboard?.writeText(value);
  },
};

const UiContext = createContext<UiDependencies>(fallback);

export function UiProvider({ value, children }: { value: UiDependencies; children: ReactNode }) {
  return <UiContext.Provider value={value}>{children}</UiContext.Provider>;
}

/**
 * Falls back to a light theme and a bare clipboard write when no provider is
 * present, so a primitive rendered in isolation (a test, a storybook) still works.
 */
export function useUi(): UiDependencies {
  return useContext(UiContext);
}
