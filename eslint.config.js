// @ts-check
import { builtinModules } from 'node:module';
import eslint from '@eslint/js';
import prettier from 'eslint-config-prettier/flat';
import reactHooks from 'eslint-plugin-react-hooks';
import tseslint from 'typescript-eslint';

const nodeBuiltins = builtinModules.flatMap((name) =>
  name.startsWith('node:') ? [name] : [name, `node:${name}`],
);

export default tseslint.config(
  {
    ignores: [
      '**/dist/',
      '**/coverage/',
      '**/.turbo/',
      '**/test-results/',
      '**/playwright-report/',
      'docs/drafts/',
    ],
  },
  eslint.configs.recommended,
  tseslint.configs.strictTypeChecked,
  {
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
  },
  {
    files: ['apps/web/src/**/*.{ts,tsx}'],
    extends: [reactHooks.configs.flat['recommended-latest']],
    rules: {
      // The router's documented pattern is `throw redirect(...)`.
      '@typescript-eslint/only-throw-error': [
        'error',
        {
          allow: [
            {
              from: 'package',
              package: '@tanstack/router-core',
              name: 'Redirect',
            },
          ],
        },
      ],
    },
  },
  {
    files: ['**/*.js'],
    extends: [tseslint.configs.disableTypeChecked],
  },
  {
    // Packages are pure: no filesystem, network or process access.
    // I/O belongs in apps (AGENTS.md, code-style rule "Boundaries").
    files: ['packages/**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          paths: nodeBuiltins.map((name) => ({
            name,
            message: 'packages/* must not do I/O; pass data in from an app.',
          })),
        },
      ],
    },
  },
  {
    // Money is parsed and formatted only in packages/shared (issue #33,
    // .agent/rules/ledger.md "Money").
    files: [
      'apps/**/*.{ts,tsx}',
      'packages/core/**/*.ts',
      'packages/parser/**/*.ts',
    ],
    rules: {
      'no-restricted-syntax': [
        'error',
        {
          selector:
            "NewExpression[callee.object.name='Intl'][callee.property.name='NumberFormat']",
          message:
            'Format and parse money with the @allotr/shared money utilities.',
        },
        {
          selector: "CallExpression[callee.property.name='toFixed']",
          message:
            'Format and parse money with the @allotr/shared money utilities.',
        },
      ],
    },
  },
  prettier,
);
