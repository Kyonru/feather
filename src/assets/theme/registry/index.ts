import featherDarkSyntax from '../dark';
import featherLightSyntax from '../light';
import { noctisThemes } from './noctis';
import { visualStudioCppThemes } from './visual-studio-cpp';
import type { AppTheme, SyntaxHighlighterStyle, ThemeId, ThemeMode, ThemePreference, ThemeVariables } from './types';

export { THEME_CSS_VARIABLES } from './types';
export type {
  AppTheme,
  NoctisThemeId,
  SyntaxHighlighterStyle,
  ThemeCssVariable,
  ThemeFamily,
  ThemeId,
  ThemeMode,
  ThemePreference,
  ThemeVariables,
  VisualStudioCppThemeId,
} from './types';

const featherLightVariables: ThemeVariables = {
  background: '#f0f4f8',
  foreground: '#403f53',
  card: '#f8fbff',
  'card-foreground': '#403f53',
  popover: '#f8fbff',
  'popover-foreground': '#403f53',
  primary: '#ad5b68',
  'primary-foreground': '#ffffff',
  secondary: '#e5ebf3',
  'secondary-foreground': '#403f53',
  muted: '#e5ebf3',
  'muted-foreground': '#6c6f85',
  accent: '#f3dfe4',
  'accent-foreground': '#873f4d',
  destructive: '#d3423e',
  border: '#d4dce8',
  input: '#c9d3e3',
  ring: '#ad5b68',
  'chart-1': '#ad5b68',
  'chart-2': '#0c969b',
  'chart-3': '#994cc3',
  'chart-4': '#c96765',
  'chart-5': '#d3423e',
  sidebar: '#e8eef6',
  'sidebar-foreground': '#403f53',
  'sidebar-primary': '#ad5b68',
  'sidebar-primary-foreground': '#ffffff',
  'sidebar-accent': '#f0dce3',
  'sidebar-accent-foreground': '#873f4d',
  'sidebar-border': '#d4dce8',
  'sidebar-ring': '#ad5b68',
  'plugin-accent': '#8a5a9f',
  'plugin-active': '#eee1f2',
  'plugin-active-foreground': '#563965',
  'plugin-active-icon': '#74498a',
  'plugin-active-border': '#d5bddf',
};

const featherDarkVariables: ThemeVariables = {
  background: '#0d1117',
  foreground: '#c9d1d9',
  card: '#161b22',
  'card-foreground': '#c9d1d9',
  popover: '#161b22',
  'popover-foreground': '#c9d1d9',
  primary: '#8b949e',
  'primary-foreground': '#0d1117',
  secondary: '#21262d',
  'secondary-foreground': '#c9d1d9',
  muted: '#21262d',
  'muted-foreground': '#8b949e',
  accent: '#30363d',
  'accent-foreground': '#c9d1d9',
  destructive: '#f85149',
  border: '#30363d',
  input: '#30363d',
  ring: '#8b949e',
  'chart-1': '#8b949e',
  'chart-2': '#3fb950',
  'chart-3': '#bc8cff',
  'chart-4': '#d29922',
  'chart-5': '#f85149',
  sidebar: '#161b22',
  'sidebar-foreground': '#c9d1d9',
  'sidebar-primary': '#8b949e',
  'sidebar-primary-foreground': '#0d1117',
  'sidebar-accent': '#21262d',
  'sidebar-accent-foreground': '#c9d1d9',
  'sidebar-border': '#30363d',
  'sidebar-ring': '#ff9aa2',
  'plugin-accent': '#c9a0dc',
  'plugin-active': '#31263a',
  'plugin-active-foreground': '#f1def8',
  'plugin-active-icon': '#dfb7f0',
  'plugin-active-border': '#7f4d94',
};

export const appThemes: Record<ThemeId, AppTheme> = {
  light: {
    id: 'light',
    label: 'Feather Light',
    family: 'Feather',
    mode: 'light',
    swatches: ['#f0f4f8', '#ad5b68', '#0c969b', '#994cc3'],
    variables: featherLightVariables,
    syntax: featherLightSyntax as SyntaxHighlighterStyle,
  },
  dark: {
    id: 'dark',
    label: 'Feather Dark',
    family: 'Feather',
    mode: 'dark',
    swatches: ['#0d1117', '#8b949e', '#3fb950', '#bc8cff'],
    variables: featherDarkVariables,
    syntax: featherDarkSyntax as SyntaxHighlighterStyle,
  },
  ...noctisThemes,
  ...visualStudioCppThemes,
};

export type ThemeSelectorOption = {
  value: ThemePreference;
  label: string;
  mode: ThemeMode | 'system';
  swatches: string[];
};

export type ThemeSelectorGroup = {
  label: string;
  options: ThemeSelectorOption[];
};

function optionForTheme(id: ThemeId): ThemeSelectorOption {
  const theme = appThemes[id];
  return {
    value: id,
    label: theme.label,
    mode: theme.mode,
    swatches: theme.swatches,
  };
}

export const themeSelectorGroups: ThemeSelectorGroup[] = [
  {
    label: 'Default',
    options: [
      {
        value: 'system',
        label: 'System',
        mode: 'system',
        swatches: ['#f0f4f8', '#0d1117', '#ad5b68', '#8b949e'],
      },
      optionForTheme('light'),
      optionForTheme('dark'),
    ],
  },
  {
    label: 'Noctis Light',
    options: [optionForTheme('noctis-lux'), optionForTheme('noctis-hibernus'), optionForTheme('noctis-lilac')],
  },
  {
    label: 'Noctis Dark',
    options: [
      optionForTheme('noctis'),
      optionForTheme('noctis-azureus'),
      optionForTheme('noctis-bordo'),
      optionForTheme('noctis-obscuro'),
      optionForTheme('noctis-sereno'),
      optionForTheme('noctis-uva'),
      optionForTheme('noctis-viola'),
      optionForTheme('noctis-minimus'),
    ],
  },
  {
    label: 'Visual Studio C/C++ Light',
    options: [optionForTheme('vs-cpp-light'), optionForTheme('vs-cpp-2017-light')],
  },
  {
    label: 'Visual Studio C/C++ Dark',
    options: [optionForTheme('vs-cpp-dark'), optionForTheme('vs-cpp-2017-dark')],
  },
];

export const themePreferences = themeSelectorGroups.flatMap((group) =>
  group.options.map((option) => option.value),
) as ThemePreference[];

export function isThemePreference(value: unknown): value is ThemePreference {
  return typeof value === 'string' && themePreferences.includes(value as ThemePreference);
}

export function normalizeThemePreference(value: unknown): ThemePreference {
  return isThemePreference(value) ? value : 'system';
}

export function resolveThemeId(preference: ThemePreference, systemMode: ThemeMode): ThemeId {
  return preference === 'system' ? systemMode : preference;
}

export function resolveTheme(preference: ThemePreference, systemMode: ThemeMode): AppTheme {
  return appThemes[resolveThemeId(preference, systemMode)];
}
