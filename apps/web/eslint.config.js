import js from '@eslint/js';
import globals from 'globals';
import reactHooks from 'eslint-plugin-react-hooks';
import reactRefresh from 'eslint-plugin-react-refresh';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  { ignores: ['dist', 'node_modules'] },
  {
    files: ['**/*.{ts,tsx}'],
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    languageOptions: {
      ecmaVersion: 2022,
      globals: globals.browser,
    },
    plugins: {
      'react-hooks': reactHooks,
      'react-refresh': reactRefresh,
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      // Les fichiers de shadcn/ui exportent composants et variantes côte à côte :
      // c'est le format officiel, on autorise les exports constants.
      'react-refresh/only-export-components': ['warn', { allowConstantExport: true }],
      // Les préfixes `_` marquent les paramètres volontairement inutilisés (middlewares Express, handlers).
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
    },
  },
  {
    // Les composants shadcn/ui exportent volontairement leurs variantes (`buttonVariants`)
    // et réexportent les primitives Radix aux côtés des composants. Le contexte de filtres
    // expose de la même façon son provider et ses hooks. C'est le format attendu : la règle
    // de Fast Refresh ne s'y applique pas.
    files: ['src/presentation/components/ui/**/*.tsx', 'src/presentation/hooks/useFilters.tsx'],
    rules: {
      'react-refresh/only-export-components': 'off',
    },
  },
);
