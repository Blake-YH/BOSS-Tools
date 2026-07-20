import js from '@eslint/js'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import globals from 'globals'
import tseslint from 'typescript-eslint'

export default tseslint.config(
  {
    ignores: [
      'out/**',
      '.output/**',
      '.wxt/**',
      'release/**',
      'node_modules/**',
      '.trellis/**',
      '.claude/**',
      '.codex/**',
      '.agents/**'
    ]
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ['scripts/**/*.mjs'],
    languageOptions: {
      globals: { ...globals.node, ...globals.browser }
    }
  },
  {
    files: [
      'src/domain/**/*.ts',
      'src/extension/**/*.ts',
      'src/shared/**/*.ts',
      'tests/**/*.ts'
    ],
    languageOptions: {
      globals: globals.node
    }
  },
  {
    files: ['entrypoints/**/*.{ts,tsx}', 'src/ui/**/*.{ts,tsx}'],
    languageOptions: {
      globals: globals.browser
    },
    plugins: {
      'react-hooks': reactHooks,
      'react-refresh': reactRefresh
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      'react-refresh/only-export-components': ['warn', { allowConstantExport: true }]
    }
  }
)
