import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import prettierConfig from 'eslint-config-prettier';
import prettierPlugin from 'eslint-plugin-prettier';
import globals from 'globals';

export default tseslint.config(
  {
    ignores: ['dist/**', 'node_modules/**', 'coverage/**', '*.config.js', '*.config.ts'],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  ...tseslint.configs.stylistic,
  {
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
      globals: {
        ...globals.browser,
        ...globals.node,
      },
      parserOptions: {
        project: './tsconfig.json',
        tsconfigRootDir: import.meta.dirname,
      },
    },
    plugins: {
      prettier: prettierPlugin,
    },
    rules: {
      'prettier/prettier': 'warn',
      '@typescript-eslint/no-unused-vars': [
        'warn',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
      '@typescript-eslint/consistent-type-imports': [
        'warn',
        { prefer: 'type-imports', fixStyle: 'inline-type-imports' },
      ],
      '@typescript-eslint/no-explicit-any': 'warn',
      'no-console': ['warn', { allow: ['warn', 'error', 'info'] }],
      'prefer-const': 'warn',
      eqeqeq: ['error', 'always'],
    },
  },
  {
    files: ['tests/**/*.ts', 'src/**/*.{test,spec}.ts'],
    rules: {
      '@typescript-eslint/no-explicit-any': 'off',
      'no-console': 'off',
    },
  },
  prettierConfig,
);
