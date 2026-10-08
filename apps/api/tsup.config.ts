import { defineConfig } from 'tsup';

// Bundle de production : les packages du monorepo (@ds/*) sont embarqués, les dépendances npm restent externes.
export default defineConfig({
  entry: ['src/main.ts', 'src/seed.ts'],
  format: ['esm'],
  platform: 'node',
  target: 'node22',
  outDir: 'dist',
  clean: true,
  sourcemap: true,
  noExternal: [/^@ds\//],
});
