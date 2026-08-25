import { fileURLToPath, URL } from 'node:url'

import { defineConfig } from 'vitest/config'

export default defineConfig({
  root: fileURLToPath(new URL('../..', import.meta.url)),
  resolve: {
    alias: [
      {
        find: /^@\/modules\/(.*)$/,
        replacement: fileURLToPath(new URL('../api/src/modules/$1', import.meta.url)),
      },
      {
        find: /^@\/common\/(.*)$/,
        replacement: fileURLToPath(new URL('../api/src/common/$1', import.meta.url)),
      },
      {
        find: '@brand-flow/contracts',
        replacement: fileURLToPath(
          new URL('../../packages/contracts/src/index.ts', import.meta.url),
        ),
      },
      {
        find: '@',
        replacement: fileURLToPath(new URL('./src', import.meta.url)),
      },
    ],
  },
  test: {
    environment: 'node',
    include: ['benchmarks/**/*.benchmark.test.ts'],
    testTimeout: 600_000,
    hookTimeout: 30_000,
    sequence: {
      concurrent: false,
    },
  },
})
