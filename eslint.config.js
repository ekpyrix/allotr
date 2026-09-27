// @ts-check
import { builtinModules } from 'node:module';
import eslint from '@eslint/js';
import prettier from 'eslint-config-prettier/flat';
import tseslint from 'typescript-eslint';

const nodeBuiltins = builtinModules.flatMap((name) =>
  name.startsWith('node:') ? [name] : [name, `node:${name}`],
);

export default tseslint.config(
  {
    ignores: ['**/dist/', '**/coverage/', '**/.turbo/', 'docs/drafts/'],
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
  prettier,
);
