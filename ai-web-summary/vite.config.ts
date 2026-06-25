import { defineConfig } from 'vite';
import { crx } from '@crxjs/vite-plugin';
import { fileURLToPath, URL } from 'node:url';
import manifest from './manifest.config';

/** Vite + CRXJS 构建配置,自动处理 MV3 多入口与 manifest */
export default defineConfig({
  plugins: [crx({ manifest })],
  resolve: {
    alias: {
      /** @/* 路径别名 → src/ 目录绝对路径(跨平台、ESM 安全) */
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
});
