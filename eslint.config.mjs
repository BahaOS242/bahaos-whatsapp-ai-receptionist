// @ts-check
import eslint from "@eslint/js";
import tseslint from "typescript-eslint";
import eslintConfigPrettier from "eslint-config-prettier";
import globals from "globals";

export default tseslint.config(
  {
    // js/**, css/**, and index.html are the standalone static HTML/CSS/JS
    // portfolio demo (browser-context, no build step, no TypeScript) — a
    // separate concern from this Node/TS backend and never intended to be
    // linted by this Node-scoped config.
    ignores: ["dist/**", "node_modules/**", "drizzle/**", "js/**", "css/**", "index.html"],
  },
  eslint.configs.recommended,
  ...tseslint.configs.recommended,
  eslintConfigPrettier,
  {
    languageOptions: {
      globals: {
        ...globals.node,
      },
    },
  },
  {
    // Staff inbox UI: dependency-free browser ES modules.
    files: ["public/**/*.js"],
    languageOptions: { globals: { ...globals.browser } },
  },
  {
    rules: {
      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
      ],
    },
  },
);
