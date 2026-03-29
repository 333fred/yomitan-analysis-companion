import { defineConfig, build as viteBuild } from 'vite';
import { resolve } from 'path';
import { readFileSync, writeFileSync, cpSync } from 'fs';

const srcDir = resolve(__dirname, 'src');
const distDir = resolve(__dirname, 'dist');

export default defineConfig({
  root: srcDir,
  build: {
    outDir: distDir,
    emptyOutDir: true,
    sourcemap: process.env.NODE_ENV === 'development',
    rollupOptions: {
      // Content script is built separately as IIFE (see plugin below)
      // because Chrome content scripts don't support ES module imports.
      input: {
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
      name: 'build-content-script-iife',
      async closeBundle() {
        // Content scripts run as classic scripts in Chrome — no ES module
        // support. Build as a self-contained IIFE so all dependencies are
        // inlined and there are no import statements.
        await viteBuild({
          configFile: false,
          root: srcDir,
          logLevel: 'warn',
          build: {
            outDir: distDir,
            emptyOutDir: false,
            copyPublicDir: false,
            sourcemap: process.env.NODE_ENV === 'development',
            rollupOptions: {
              input: resolve(srcDir, 'content/index.ts'),
              output: {
                format: 'iife',
                entryFileNames: 'content/index.js',
              },
            },
          },
        });
      },
    },
    {
      name: 'chrome-extension-assets',
      closeBundle() {
        const raw = readFileSync(resolve(srcDir, 'manifest.json'), 'utf-8');
        const manifest = JSON.parse(raw);
        manifest.content_scripts[0].js = ['content/index.js'];
        manifest.background.service_worker = 'background/service-worker.js';
        writeFileSync(
          resolve(distDir, 'manifest.json'),
          JSON.stringify(manifest, null, 2),
        );
        cpSync(
          resolve(__dirname, 'public/icons'),
          resolve(distDir, 'icons'),
          { recursive: true },
        );
      },
    },
  ],
});
