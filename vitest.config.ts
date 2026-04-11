import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    // テスト時は SQLite インメモリ DB を使用してファイル競合を避ける
    env: {
      KOKKAI_CACHE_DB_PATH: ':memory:',
    },
    coverage: {
      reporter: ['text', 'lcov'],
      include: ['src/**/*.ts'],
      exclude: ['src/server.ts'],
    },
  },
})
