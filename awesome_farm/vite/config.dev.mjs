import { defineConfig } from 'vite';

// The dev server only: production builds use config.prod.mjs (chunking, minify).
export default defineConfig({
    base: './',
    server: {
        port: 8080
    }
});
