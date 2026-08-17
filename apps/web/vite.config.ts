import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  // Relative asset paths so the built site works from an S3 bucket root, a
  // subfolder, or a CloudFront distribution without rebuilding.
  base: './',
  build: {
    outDir: 'dist',
    sourcemap: true,
    target: 'es2022',
  },
  worker: {
    format: 'es',
  },
});
