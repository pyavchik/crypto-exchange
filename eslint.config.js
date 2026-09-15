import { defineConfig, globalIgnores } from "eslint/config";
import js from "@eslint/js";
import tseslint from "typescript-eslint";
import globals from "globals";
import eslintConfigPrettier from "eslint-config-prettier";

export default defineConfig([
  globalIgnores([
    "**/node_modules/**",
    "**/dist/**",
    "coverage/**",
    "api/data/**",
    "api/logs/**",
    "api/src/db/migrations/**",
    ".planning/**",
    "wiki/**",
    "qa/**",
    ".claude/**",
    ".gsd/**",
  ]),
  js.configs.recommended,
  tseslint.configs.recommended,
  {
    files: ["api/**/*.ts", "scripts/**/*.mjs", "eslint.config.js"],
    languageOptions: {
      globals: {
        ...globals.node,
      },
    },
  },
  {
    files: ["web/src/**/*.{ts,tsx}"],
    languageOptions: {
      globals: {
        ...globals.browser,
      },
    },
  },
  {
    files: ["web/vite.config.ts"],
    languageOptions: {
      globals: {
        ...globals.browser,
        ...globals.node,
      },
    },
  },
  {
    rules: {
      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
      ],
    },
  },
  eslintConfigPrettier,
]);
