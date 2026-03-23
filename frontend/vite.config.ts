import fs from 'fs';
import path from 'path';
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ mode }) => {
  const envDir = path.resolve(__dirname, '..');
  const env = loadEnv(mode, envDir, '');
  const defaultProxyTarget = env.DEV_SSL_PFX ? 'https://localhost:4010' : 'http://localhost:4010';
  const proxyTarget = (env.VITE_PROXY_TARGET || env.VITE_API_URL || defaultProxyTarget).replace(/\/$/, '');
  const sslPfxPath = env.DEV_SSL_PFX ? path.resolve(envDir, env.DEV_SSL_PFX) : '';
  const httpsConfig = sslPfxPath && fs.existsSync(sslPfxPath)
    ? {
        pfx: fs.readFileSync(sslPfxPath),
        passphrase: env.DEV_SSL_PASSPHRASE || undefined,
      }
    : true;

  return {
    base: '/',
    envDir,
    server: {
      https: httpsConfig,
      port: 3010,
      host: '0.0.0.0',
      proxy: {
        '/api': {
          target: proxyTarget,
          changeOrigin: true,
          secure: false,
          rewrite: (path) => path
        },
        '/socket.io': {
          target: proxyTarget,
          secure: false,
          ws: true
        }
      }
    },
    plugins: [react()],
    define: {
      'process.env.REACT_APP_API_URL': JSON.stringify(env.REACT_APP_API_URL || proxyTarget)
    },
    build: {
      rollupOptions: {
        output: {
          manualChunks: {
            'react-vendor': ['react', 'react-dom'],
            'map-vendor': ['leaflet', 'react-leaflet'],
            'ai-vendor': ['@google/genai'],
            'firebase-vendor': ['firebase/app', 'firebase/database'],
          }
        }
      }
    },
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      }
    }
  };
});
