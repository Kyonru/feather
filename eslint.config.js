import pluginQuery from '@tanstack/eslint-plugin-query';
import eslint from '@eslint/js';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  {
    ignores: [
      'node_modules/',
      'dist/',
      'build/',
      'pnpm-lock.json',
      'src/vite-env.d.ts',
      'env.d.ts',
      'vite.config.ts',
      'tailwind.config.cjs',
      'postcss.config.cjs',
      'src-tauri/',
      'src-lua/',
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
    // part of splitting the apps in V2.md Phase 05.
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
);
