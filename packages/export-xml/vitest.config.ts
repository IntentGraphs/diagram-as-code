import { defineConfig } from 'vitest/config';
import mockSVG from '@joint/vitest-plugin-mock-svg';
import { fileURLToPath } from 'node:url';

export default defineConfig({
  root: fileURLToPath(new URL('.', import.meta.url)),
  plugins: [mockSVG()],
  test: {
    environment: 'jsdom',
    setupFiles: ['./test/setup.ts'],
  },
});
