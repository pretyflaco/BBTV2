import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'happy-dom',
    include: ['tests/unit/**/*.test.{js,ts}'],
    exclude: ['node_modules', 'e2e'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      reportsDirectory: './coverage',
      include: [
        'lib/config/api.js',
        'lib/blink-api.js',
        'lib/storage/CryptoUtils.js',
        'lib/storage/ProfileStorage.js',
        'lib/batch-payments/csv-parser.js',
        'lib/batch-payments/recipient-validator.js',
      ],
      thresholds: {
        global: {
          statements: 50,
          branches: 40,
          functions: 60,
          lines: 50,
        },
      },
    },
    testTimeout: 10000,
    hookTimeout: 10000,
    setupFiles: ['./tests/unit/setup.js'],
  },
});
