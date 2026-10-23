import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["{apps,packages}/**/*.{test,spec}.{ts,tsx}"],
    coverage: {
      include: ["packages/shared/src/**/*.ts"],
      exclude: ["packages/shared/src/**/*.test.ts", "packages/shared/src/index.ts"],
      reporter: ["text", "html"],
      thresholds: {
        lines: 90,
        functions: 90,
        statements: 90,
      },
    },
  },
});
