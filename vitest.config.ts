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
        // Exclusions temporaires: points d'entrée/runtime ou IO lourds non unit-testables (prévu Lot P1/P3)
        "src/app.ts",
        "src/app/**",
        "src/sniffer-server.ts",
        "src/test-midi-send.ts",
        "src/test-utils/**",
        "src/midi/backgroundListeners.ts",
        "src/bridges/**",
        "src/xtouch/driver.ts",
        "src/xtouch/fkeys.ts",
        "src/xtouch/constants.ts",
      ],
    },
  },
});


