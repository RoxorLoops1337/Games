import { defineConfig, mergeConfig } from 'vitest/config';
import viteConfig from './vite.config';

export default mergeConfig(
  viteConfig,
  defineConfig({
    test: {
      globals: true,
      environment: 'jsdom',
      include: ['tests/**/*.{test,spec}.ts', 'src/**/*.{test,spec}.ts'],
      coverage: {
        provider: 'v8',
        reporter: ['text', 'html', 'lcov'],
        include: ['src/**/*.ts'],
        exclude: ['src/**/*.d.ts', 'src/main.ts'],
      },
    },
  }),
);
