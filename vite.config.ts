import { defineConfig } from 'vite-plus'

export default defineConfig({
  lint: {
    categories: {
      correctness: 'error',
      suspicious: 'error',
      perf: 'warn',
    },
    plugins: ['typescript', 'oxc', 'unicorn', 'import'],
    ignorePatterns: ['node_modules/**', 'dist/**', '.wrangler/**', 'coverage/**'],
    options: {
      typeAware: true,
      typeCheck: true,
    },
    overrides: [
      {
        files: ['scripts/**/*.ts'],
        rules: {
          'typescript/consistent-return': 'off',
          'typescript/no-unsafe-type-assertion': 'off',
          'typescript/no-unnecessary-type-conversion': 'off',
          'typescript/no-unnecessary-type-parameters': 'off',
        },
      },
      {
        files: ['**/*.test.ts'],
        plugins: ['typescript', 'vitest'],
        rules: {
          'typescript/no-unsafe-type-assertion': 'off',
          'vitest/no-disabled-tests': 'error',
        },
      },
    ],
  },
  fmt: {
    printWidth: 100,
    singleQuote: true,
    semi: false,
    trailingComma: 'all',
    sortImports: true,
    sortPackageJson: true,
    ignorePatterns: [
      'node_modules/**',
      'dist/**',
      '.wrangler/**',
      'coverage/**',
      'pnpm-lock.yaml',
      'internal-tools-monorepo-cloudflare-plan.md',
    ],
  },
  test: {
    include: ['src/**/*.test.ts', 'scripts/**/*.test.ts'],
  },
  staged: {
    '*.{js,jsx,ts,tsx}': 'vp check --fix',
    '*.{json,jsonc,md,mdx,yml,yaml}': 'vp fmt --write',
  },
  run: {
    cache: true,
  },
})
