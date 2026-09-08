import pluginQuery from '@tanstack/eslint-plugin-query';
import eslint from '@eslint/js';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  {
    ignores: [
      'node_modules/',
      '**/dist/',
      'dist/',
      'build/',
      'pnpm-lock.json',
      'apps/inspector/src/vite-env.d.ts',
      'env.d.ts',
      'vite.config.ts',
      'tailwind.config.cjs',
      'postcss.config.cjs',
      'apps/inspector/src-tauri/',
      'packages/runtime-lua/',
    ],
  },
  ...pluginQuery.configs['flat/recommended'],
  eslint.configs.recommended,
  tseslint.configs.recommended,
  {
    // The creative tools ship to the web as well as the desktop app, so they
    // must not reach for Tauri directly. Anything they need from the
    // environment belongs on the FeatherHost interface in @feather/host, which
    // has both a Tauri and a browser implementation.
    //
    // This covers direct imports. A few transitive paths still reach Tauri
    // through inspector hooks (notably use-ws-connection); untangling those is
    // part of splitting the apps in V4.md Phase 05.
    files: [
      'src/pages/shader-graph/**',
      'src/pages/texture-lab/**',
      'src/pages/particle-system-playground/**',
      'src/showcase/**',
    ],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['@tauri-apps/*'],
              message:
                'The creative tools also run on the web. Use the host from @feather/host (useHost) instead of importing Tauri directly.',
            },
          ],
        },
      ],
    },
  },
  {
    // @feather/host/tauri is the one place Tauri may be imported from the
    // packages, since it exists to contain exactly that.
    files: ['packages/**'],
    rules: { 'no-restricted-imports': 'off' },
  },
  {
    // Build and generator scripts are Node, not browser.
    files: ['**/scripts/**/*.mjs', 'scripts/**/*.mjs'],
    languageOptions: { globals: { console: 'readonly', process: 'readonly' } },
  },
  {
    // Feather Inspector must not import Feather Studio. They are separate
    // installed applications with separate release trains; an import here would
    // silently recreate the coupling Phase 05 removed and drag 25k lines of
    // creative tooling back into the Inspector bundle.
    files: ['apps/inspector/src/**'],
    ignores: ['apps/inspector/src/**/*.d.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['@studio/*', '**/apps/studio/*'],
              message:
                'Inspector must not import Studio. If Inspector needs something from Studio, it belongs in a shared package under packages/, or it is a sign the boundary is wrong.',
            },
          ],
        },
      ],
    },
  },
  {
    // ...and the reverse. Studio reaches a live game only through
    // @feather/session-bridge, never by importing Inspector's stores, hooks or
    // WebSocket connection.
    files: ['apps/studio/**'],
    // apps/studio/src/desktop/ is Studio's Tauri-only area, the same role
    // packages/host/src/tauri.ts plays for environment capabilities: exactly one
    // place per application may import @tauri-apps, so a web build cannot pull
    // it in by accident.
    ignores: ['apps/studio/src/desktop/**'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['@/*', '**/src/store/*', '**/src/hooks/*', '**/src/lib/*'],
              message:
                'Studio must not import Inspector. Use @feather/session-bridge for anything that needs a live game, @feather/host for environment capabilities, and @feather/ui for primitives.',
            },
            {
              group: ['@tauri-apps/*'],
              message:
                'Import the host instead. @feather/host/tauri is the only module allowed to touch Tauri, so the web build stays Tauri-free.',
            },
          ],
        },
      ],
    },
  },
);
