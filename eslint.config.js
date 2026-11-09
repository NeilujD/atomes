import js from "@eslint/js";
import astro from "eslint-plugin-astro";
import { defineConfig, globalIgnores } from "eslint/config";
import tseslint from "typescript-eslint";

export default defineConfig(
  globalIgnores(["dist/", ".astro/"]),
  js.configs.recommended,
  tseslint.configs.recommendedTypeChecked,
  {
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
  },
  {
    // astro-eslint-parser does not support projectService.
    files: ["**/*.astro"],
    languageOptions: {
      parserOptions: { projectService: false, project: true },
    },
  },
  {
    files: ["**/*.{js,mjs}"],
    extends: [tseslint.configs.disableTypeChecked],
  },
  {
    // French UI text puts no-break spaces before ":", "?" and ";", also in template strings.
    files: ["src/lib/i18n/*.ts"],
    rules: { "no-irregular-whitespace": ["error", { skipTemplates: true }] },
  },
  {
    // Served as is, outside the Vite build: a plain service worker script.
    files: ["public/sw.js"],
    languageOptions: {
      globals: { self: "readonly", caches: "readonly", fetch: "readonly", Response: "readonly", URL: "readonly" },
    },
  },
  astro.configs.recommended,
  astro.configs["jsx-a11y-recommended"],
);
