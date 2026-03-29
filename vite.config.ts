import { defineConfig } from 'vite';
import { resolve } from 'path';
import { readFileSync, writeFileSync, cpSync } from 'fs';

const srcDir = resolve(__dirname, 'src');

export default defineConfig({
  root: srcDir,
  build: {
    outDir: resolve(__dirname, 'dist'),
    emptyOutDir: true,
    sourcemap: process.env.NODE_ENV === 'development',
    rollupOptions: {
      input: {
        'content/index': resolve(srcDir, 'content/index.ts'),
        'background/service-worker': resolve(srcDir, 'background/service-worker.ts'),
        options: resolve(srcDir, 'options/options.html'),
      },
      output: {
        entryFileNames: '[name].js',
        chunkFileNames: 'chunks/[name]-[hash].js',
        assetFileNames: 'assets/[name]-[hash].[ext]',
      },
    },
  },
  plugins: [
    {
      name: 'chrome-extension-assets',
      closeBundle() {
        const distDir = resolve(__dirname, 'dist');
        // Copy manifest.json with .ts paths replaced by .js
        const raw = readFileSync(resolve(srcDir, 'manifest.json'), 'utf-8');
        const manifest = JSON.parse(raw);
        manifest.content_scripts[0].js = ['content/index.js'];
        manifest.background.service_worker = 'background/service-worker.js';
        writeFileSync(
          resolve(distDir, 'manifest.json'),
          JSON.stringify(manifest, null, 2),
        );
        // Copy icons from public/
        cpSync(
          resolve(__dirname, 'public/icons'),
          resolve(distDir, 'icons'),
          { recursive: true },
        );
      },
    },
  ],
});
