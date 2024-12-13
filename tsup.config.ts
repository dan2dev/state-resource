import { defineConfig } from 'tsup'

const somethin: string = "";

export default defineConfig({
    entry: {
        index: 'src/index.ts',
        worker: 'src/worker.ts',
    },
    outDir: 'dist',
    format: ['esm', 'cjs', 'iife'],
    splitting: true,
    sourcemap: true,
    dts: true,
    clean: true,
    target: ["es6", "es2023", "esnext", "es2024"],
    treeshake: true,
    terserOptions: {
        compress: true,
    }
})
