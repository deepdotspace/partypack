import { defineConfig } from 'vitest/config'

// Unit tests cover the pure game engine in src/game/*. The Playwright specs in
// tests/ are run by `deepspace test e2e`, NOT vitest — exclude them here so a
// bare `vitest run` doesn't try to load @playwright/test.
export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
    exclude: ['node_modules', 'dist', 'tests'],
  },
})
