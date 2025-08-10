import pluginQuery from '@tanstack/eslint-plugin-query';

import eslint from '@eslint/js';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  ...pluginQuery.configs['flat/recommended'],
  // Any other config...

  eslint.configs.recommended,
  tseslint.configs.recommended,
);
