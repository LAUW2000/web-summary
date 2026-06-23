import { defineConfig } from 'vite';
import { crx } from '@crxjs/vite-plugin';
import manifest from './manifest.config';

/** Vite + CRXJS 构建配置,自动处理 MV3 多入口与 manifest */
export default defineConfig({
  plugins: [crx({ manifest })],
  resolve: { alias: { '@': '/src' } },
});
