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
);
