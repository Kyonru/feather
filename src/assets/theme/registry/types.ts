import type { CSSProperties } from 'react';

export const THEME_CSS_VARIABLES = [
  'background',
  'foreground',
  'card',
  'card-foreground',
  'popover',
  'popover-foreground',
  'primary',
  'primary-foreground',
  'secondary',
  'secondary-foreground',
  'muted',
  'muted-foreground',
  'accent',
  'accent-foreground',
  'destructive',
  'border',
  'input',
  'ring',
  'chart-1',
  'chart-2',
  'chart-3',
  'chart-4',
  'chart-5',
  'sidebar',
  'sidebar-foreground',
  'sidebar-primary',
  'sidebar-primary-foreground',
  'sidebar-accent',
  'sidebar-accent-foreground',
  'sidebar-border',
  'sidebar-ring',
  'plugin-accent',
  'plugin-active',
  'plugin-active-foreground',
  'plugin-active-icon',
  'plugin-active-border',
] as const;

export type ThemeCssVariable = (typeof THEME_CSS_VARIABLES)[number];
export type ThemeMode = 'light' | 'dark';
export type ThemeFamily = 'Feather' | 'GitHub' | 'Noctis' | 'Rainglow' | 'Tokyo Night' | 'Visual Studio C/C++';
export type NoctisThemeId =
  | 'noctis-lux'
  | 'noctis-hibernus'
  | 'noctis-lilac'
  | 'noctis'
  | 'noctis-azureus'
  | 'noctis-bordo'
  | 'noctis-obscuro'
  | 'noctis-sereno'
  | 'noctis-uva'
  | 'noctis-viola'
  | 'noctis-minimus';
export type VisualStudioCppThemeId =
  | 'vs-cpp-light'
  | 'vs-cpp-dark'
  | 'vs-cpp-2017-light'
  | 'vs-cpp-2017-dark';
export type TokyoNightThemeId =
  | 'tokyo-night-light'
  | 'tokyo-night'
  | 'tokyo-night-storm';
export type RainglowThemeId = 'rainglow-absent-light';
export type GitHubThemeId =
  | 'github-light'
  | 'github-light-default'
  | 'github-light-high-contrast'
  | 'github-light-colorblind'
  | 'github-dark-default'
  | 'github-dark-high-contrast'
  | 'github-dark-colorblind'
  | 'github-dark-dimmed';
export type ThemeId =
  | 'light'
  | 'dark'
  | GitHubThemeId
  | NoctisThemeId
  | RainglowThemeId
  | TokyoNightThemeId
  | VisualStudioCppThemeId;
export type ThemePreference = 'system' | ThemeId;
export type ThemeVariables = Record<ThemeCssVariable, string>;
export type SyntaxHighlighterStyle = Record<string, CSSProperties>;

export type AppTheme = {
  id: ThemeId;
  label: string;
  family: ThemeFamily;
  mode: ThemeMode;
  swatches: string[];
  variables: ThemeVariables;
  syntax: SyntaxHighlighterStyle;
};

export type ThemeSyntaxPalette = {
  comment: string;
  text: string;
  keyword: string;
  variable: string;
  annotation: string;
  constant: string;
  tag: string;
  string: string;
  interpolated: string;
  number: string;
  function: string;
  support: string;
  misc: string;
  invalid: string;
};

export type ThemeSeed = {
  label: string;
  mode: ThemeMode;
  swatches: string[];
  variables: ThemeVariables;
  syntax: ThemeSyntaxPalette;
};

export function createSyntaxHighlighterStyle(theme: ThemeSeed): SyntaxHighlighterStyle {
  const { syntax, variables } = theme;

  return {
    'hljs-comment': { color: syntax.comment },
    'hljs-quote': { color: syntax.comment },
    'hljs-variable': { color: syntax.variable },
    'hljs-template-variable': { color: syntax.interpolated },
    'hljs-tag': { color: syntax.tag },
    'hljs-name': { color: syntax.tag },
    'hljs-selector-id': { color: syntax.variable },
    'hljs-selector-class': { color: syntax.variable },
    'hljs-regexp': { color: syntax.string },
    'hljs-deletion': { color: syntax.invalid },
    'hljs-number': { color: syntax.number },
    'hljs-built_in': { color: syntax.support },
    'hljs-builtin-name': { color: syntax.support },
    'hljs-literal': { color: syntax.number },
    'hljs-type': { color: syntax.annotation },
    'hljs-params': { color: syntax.text },
    'hljs-meta': { color: syntax.comment },
    'hljs-link': { color: syntax.misc },
    'hljs-attribute': { color: syntax.constant },
    'hljs-string': { color: syntax.string },
    'hljs-symbol': { color: syntax.string },
    'hljs-bullet': { color: syntax.string },
    'hljs-addition': { color: syntax.string },
    'hljs-title': { color: syntax.function },
    'hljs-section': { color: syntax.function },
    'hljs-keyword': { color: syntax.keyword },
    'hljs-selector-tag': { color: syntax.tag },
    hljs: {
      display: 'block',
      overflowX: 'auto',
      background: variables.background,
      color: syntax.text,
      padding: '0.5em',
    },
    'hljs-emphasis': { fontStyle: 'italic' },
    'hljs-strong': { fontWeight: 'bold' },
  };
}
