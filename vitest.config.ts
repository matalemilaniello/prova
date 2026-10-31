import { defineConfig } from 'vitest/config';

// I motori lavorano con date locali: i test girano nel fuso dell'utente, ora legale compresa.
process.env.TZ = 'Europe/Rome';

export default defineConfig({
  define: {
    __APP_VERSION__: JSON.stringify('test'),
    __BUILD_DATE__: JSON.stringify('2026-01-01'),
  },
  test: {
    environment: 'node',
    include: ['src/**/*.test.{ts,tsx}', 'scripts/**/*.test.ts'],
    env: { TZ: 'Europe/Rome' },
    restoreMocks: true,
  },
});
