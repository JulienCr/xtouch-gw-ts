import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["**/_tests/**/*.test.ts"],
    exclude: ["node_modules", "dist"],
    coverage: {
      provider: "v8",
      reporter: ["text", "html", "lcov"],
      all: true,
      include: ["src/**/*.ts"],
      exclude: [
        "**/_tests/**/*.test.ts",
        "src/**/index.ts",
        "src/**/types.ts",
        "src/**/cli/**",
      ],
    },
  },
});


