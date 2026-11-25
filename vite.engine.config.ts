import { defineConfig } from 'vite';
import { resolve } from 'node:path';

/** 引擎独立构建：SDK 打进插件，Node 内置模块保持外部。 */
export default defineConfig({
  build: {
    outDir: resolve(import.meta.dirname, 'dist'),
    emptyOutDir: false,
    lib: {
      entry: resolve(import.meta.dirname, 'src/engine.ts'),
      formats: ['es'],
      fileName: () => 'engine.js',
    },
    rolldownOptions: {
      external: [/^node:/],
    },
  },
});
