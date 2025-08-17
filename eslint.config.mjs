// @ts-check
import tseslint from "@typescript-eslint/eslint-plugin";
import tsparser from "@typescript-eslint/parser";

/** @type {import("@typescript-eslint/utils/ts-eslint").FlatConfig.ConfigArray} */
export default [
  {
    ignores: ["dist/**", "coverage/**", "docs/**", "web/**"],
  },
  {
    files: ["**/*.ts"],
    ignores: ["dist/**", "docs/**", "web/**", "coverage/**"],
    languageOptions: {
      parser: tsparser,
      parserOptions: { project: false, sourceType: "module" },
    },
    plugins: { "@typescript-eslint": tseslint },
    rules: {
      // Some users have global configs that reference rules not present in our plugin version
      "@typescript-eslint/no-var-requires": "off",
      "@typescript-eslint/no-require-imports": "off",
      "no-unused-vars": "off",
      "@typescript-eslint/no-unused-vars": ["warn", { argsIgnorePattern: "^_" }],
      "@typescript-eslint/consistent-type-imports": ["warn", { prefer: "type-imports" }],
      "no-console": "off",
    },
  },
];


