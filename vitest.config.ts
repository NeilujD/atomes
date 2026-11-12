import { getViteConfig } from 'astro/config';
import { configDefaults } from 'vitest/config';

// Loads astro.config.mjs so that tests can import .astro components.
export default getViteConfig({
  // e2e/: Playwright specs (`bun run test:e2e`), not Vitest tests.
  test: { exclude: [...configDefaults.exclude, 'e2e/**'] },
});
