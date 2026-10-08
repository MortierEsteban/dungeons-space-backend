import { defineConfig } from 'vitest/config';

// Un seul runner pour tout le monorepo : chaque workspace déclare ses tests en *.test.ts(x).
export default defineConfig({
  test: {
    projects: ['packages/*', 'apps/api', 'apps/web'],
  },
});
