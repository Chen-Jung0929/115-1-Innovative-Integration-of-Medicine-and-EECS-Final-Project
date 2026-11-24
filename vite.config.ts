import { spawnSync } from 'node:child_process';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  base: process.env.PAGES_BASE_PATH || '/',
  plugins: [
    react(),
    {
      name: 'pages-build-revision',
      apply: 'build',
      transformIndexHtml() {
        const revision = spawnSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).stdout?.trim() || 'unversioned';
        return [{ tag: 'meta', attrs: { name: 'build-revision', content: revision }, injectTo: 'head' }];
      },
    },
  ],
  build: {
    rollupOptions: {
      output: {
        // Isolate the real SDK so browser tests can stub inference on the shipped build.
        manualChunks: { 'pose-runtime': ['@mediapipe/tasks-vision'] },
      },
    },
  },
});
