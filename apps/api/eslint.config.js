import js from '@eslint/js';
import globals from 'globals';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  { ignores: ['node_modules'] },
  {
    files: ['**/*.ts'],
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    languageOptions: {
      ecmaVersion: 2023,
      globals: globals.node,
    },
    rules: {
      // Les préfixes `_` marquent les paramètres imposés par une signature mais inutilisés
      // (le `next` d'un middleware d'erreur Express, par exemple).
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
      // `findById(id)!` juste après un INSERT : la ligne existe forcément.
      '@typescript-eslint/no-non-null-assertion': 'off',
    },
  },
);
