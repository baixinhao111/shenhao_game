import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'node:path';

export default defineConfig(({ mode }) => {
  const demo = mode === 'demo';
  return {
    plugins: [react()],
    // `--mode demo`: self-contained offline preview (mock backend, relative paths)
    ...(demo
      ? {
          base: './',
          publicDir: false,
          resolve: {
            alias: [
              { find: /^\.\/backend$/, replacement: path.resolve(__dirname, 'src/demo/backendDemo.ts') },
              { find: /^\.\/fonts$/, replacement: path.resolve(__dirname, 'src/demo/fontsDemo.ts') },
            ],
          },
          build: { outDir: 'dist-demo', assetsDir: 'build', emptyOutDir: true },
        }
      : {}),
    server: {
      port: 5173,
      host: true,
      proxy: {
        '/api': {
          target: 'http://127.0.0.1:3080',
          changeOrigin: true,
        },
      },
    },
  };
});
