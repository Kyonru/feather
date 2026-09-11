import pluginQuery from '@tanstack/eslint-plugin-query';
import eslint from '@eslint/js';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  {
    ignores: [
      'node_modules/',
      '**/dist/',
      // Build output that now falls inside the lint scope since apps/ moved
      // under one roof. These are generated, not authored.
      '**/bundled-cli/',
      '**/bundled-bin/',
      '**/out/',
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
    // An underscore prefix is the conventional way to say "deliberately unused",
    // which matters for parameters a signature keeps for documentation.
    rules: {
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_', caughtErrorsIgnorePattern: '^_' },
      ],
    },
  },
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
    languageOptions: {
      globals: { console: 'readonly', process: 'readonly', URL: 'readonly', fetch: 'readonly' },
    },
  },
  {
    // Node test files: node:test globals plus the Node runtime.
    files: ['**/test/**/*.mjs', '**/test/**/*.mts'],
    languageOptions: {
      globals: {
        console: 'readonly',
        process: 'readonly',
        URL: 'readonly',
        fetch: 'readonly',
        setTimeout: 'readonly',
        clearTimeout: 'readonly',
        Buffer: 'readonly',
      },
    },
  },
  {
    // .cjs really is CommonJS. `require` there is correct, not a lapse, and the
    // VS Code integration harness runs under Mocha's globals.
    files: ['**/*.cjs'],
    languageOptions: {
      sourceType: 'commonjs',
      globals: {
        require: 'readonly',
        module: 'writable',
        __dirname: 'readonly',
        console: 'readonly',
        process: 'readonly',
        suite: 'readonly',
        test: 'readonly',
        setup: 'readonly',
        teardown: 'readonly',
      },
    },
    rules: { '@typescript-eslint/no-require-imports': 'off' },
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
      // Color is a reserved channel: the four semantic states and the accent.
      // Raw Tailwind palette literals bypass it, which is how Inspector ended up
      // with 17 different ambers meaning "warning", none of them reachable by
      // the 79 shipped themes and several failing WCAG AA on the backgrounds
      // those themes set. Use text-ok / bg-warn-surface / border-danger-border,
      // which are derived per theme and contrast-tested.
      //
      // Syntax highlighting is the deliberate exception — a string literal in a
      // stack trace is not a state — and is opted out of with an inline disable
      // that says so.
    },
  },
  {
    // Both apps, because Studio inherited Inspector's tools and, with them, 86
    // raw literals expressing the same four meanings. The semantic ramps are
    // derived by one shared module (`@feather/ui/theme/semantic`), so the rule
    // that keeps colour meaningful belongs to both. See V4-STUDIO.md S5.
    files: ['apps/inspector/src/**', 'apps/studio/src/**'],
    rules: {
      'no-restricted-syntax': [
        'error',
        {
          selector:
            "Literal[value=/\\b(?:text|bg|border|fill|stroke|ring|from|to|via)-(?:red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose)-[0-9]{2,3}\\b/]",
          message:
            'Raw Tailwind color literal. Colour here means state: use the ok / warn / danger / info tokens (text-ok, bg-warn-surface, border-danger-border), or muted-foreground for chrome. If the colour marks identity rather than state — a node kind, a drag handle — opt out with an inline disable that says so. See V4-ENHANCED.md §4 (C0).',
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
