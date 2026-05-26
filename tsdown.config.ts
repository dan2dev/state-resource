import { defineConfig } from 'tsdown'

export default defineConfig({
  entry: { 'state-resource': 'src/index.ts' },
  format: ['esm', 'cjs', 'umd'],
  outDir: 'dist',
  clean: true,
  dts: false,
  minify: true,
  sourcemap: true,
  globalName: 'StateResource',
  deps: { neverBundle: ['react'] },
  outputOptions: { globals: { react: 'React' } },
})
