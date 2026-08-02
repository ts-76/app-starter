import { defineConfig, lazyPlugins } from 'vite-plus'

export default defineConfig(({ mode }) => ({
  plugins:
    mode === 'test'
      ? []
      : lazyPlugins(async () => {
          const [{ cloudflare }, { reactRouter }, { default: tailwindcss }] = await Promise.all([
            import('@cloudflare/vite-plugin'),
            import('@react-router/dev/vite'),
            import('@tailwindcss/vite'),
          ])
          return [
            cloudflare({ inspectorPort: false, viteEnvironment: { name: 'ssr' } }),
            tailwindcss(),
            reactRouter(),
          ]
        }),
  lint: {
    categories: {
      correctness: 'error',
      suspicious: 'error',
      perf: 'warn',
    },
    plugins: ['typescript', 'oxc', 'unicorn', 'import'],
    ignorePatterns: [
      'node_modules/**',
      'dist/**',
      'build/**',
      '.react-router/**',
      '.wrangler/**',
      'coverage/**',
      '.agents/skills/**',
      'worker-configuration.d.ts',
    ],
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
        files: ['app/root.tsx'],
        rules: { 'import/no-unassigned-import': 'off' },
      },
      {
        files: ['**/*.test.{ts,tsx}'],
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
      'build/**',
      '.react-router/**',
      '.wrangler/**',
      'coverage/**',
      '.agents/skills/**',
      'package-lock.json',
    ],
  },
  test: {
    include: ['app/**/*.test.{ts,tsx}', 'src/**/*.test.{ts,tsx}', 'scripts/**/*.test.ts'],
  },
  staged: {
    '*.{js,jsx,ts,tsx}': 'vp check --fix',
    '*.{json,jsonc,md,mdx,yml,yaml}': 'vp fmt --write',
  },
  run: {
    cache: true,
  },
}))
