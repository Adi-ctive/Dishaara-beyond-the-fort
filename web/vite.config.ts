import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// GitHub Pages serves the site under /<repo>/.
export default defineConfig({
  base: process.env.PAGES_BASE ?? '/',
  plugins: [react()],
});
