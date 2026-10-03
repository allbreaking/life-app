import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  clearScreen: false,
  server: { port: 1420, strictPort: true },
  envPrefix: ['VITE_', 'TAURI_'],
  build: {
    target: ['es2021', 'safari13'],
    // 依赖独立成 chunk：入口只保留应用代码，第三方库增长不再直接顶破单产物发布预算。
    rollupOptions: {
      output: {
        manualChunks: (id) => {
          if (id.indexOf('node_modules') === -1) return undefined;
          if (/node_modules[\\/](react|react-dom|scheduler)[\\/]/.test(id)) return 'react-vendor';
          return 'vendor';
        },
      },
    },
  },
  test: { environment: 'jsdom', setupFiles: './src/test/setup.ts' },
});
