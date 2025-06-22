import path from 'node:path'
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react-oxc'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },

  test: {
    globals: true,
    setupFiles: './tests/setup.ts',
    coverage: {
      reporter: ['text', 'html', 'json-summary', 'json', 'lcov'],
      reportOnFailure: true,
      include: ['src/**/*.{ts,tsx}'],
    },
    projects: [
      // matches every folder and file inside the `packages` folder
      'packages/*',
      {
        // add "extends: true" to inherit the options from the root config
        extends: true,
        test: {
          include: ['tests/**/*.test.{ts,js}'],
          // it is recommended to define a name when using inline configs
          name: 'unit',
          environment: 'happy-dom',
        },
      },
      {
        // add "extends: true" to inherit the options from the root config
        extends: true,
        test: {
          include: ['tests/**/*.e2e.test.{ts,tsx}'],
          browser: {
            enabled: true,
            provider: 'playwright',
            // https://vitest.dev/guide/browser/playwright
            instances: [{ browser: 'chromium' }],
          },
          name: 'e2e',
        },
      },
    ],
  },
})
