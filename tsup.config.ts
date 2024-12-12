import { defineConfig } from 'tsup'

const somethin: string = "";

export default defineConfig({
    entry: ['src/index.ts'],
    format: ['esm', 'cjs', 'iife'],
    splitting: true,
    sourcemap: true,
    dts: true,
    clean: true,
    target: ["es6", "es2023", "esnext", "es2024"],
    treeshake: true,
})
