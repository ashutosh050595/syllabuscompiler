
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, (process as any).cwd(), '');
  return {
    plugins: [react()],
    define: {
      // Securely inject the API key during build. Default to empty string if undefined to prevent undefined replacement.
      'process.env.API_KEY': JSON.stringify(env.API_KEY || ''),
    },
    server: {
      port: 3000
    }
  };
});
