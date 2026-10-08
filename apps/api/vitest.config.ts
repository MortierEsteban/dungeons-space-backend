import { defineProject } from 'vitest/config';

export default defineProject({
  test: { name: 'api', environment: 'node', testTimeout: 30000, hookTimeout: 60000 },
});
