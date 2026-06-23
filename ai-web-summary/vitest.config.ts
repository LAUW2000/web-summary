import { defineConfig } from 'vitest/config';
import { fileURLToPath, URL } from 'node:url';

/** Vitest 配置:node 环境,开启全局 API,路径别名对齐 tsconfig */
export default defineConfig({
  test: { globals: true, environment: 'node' },
  resolve: {
    alias: {
      /** @/* 路径别名 → src/ 目录绝对路径,与 tsconfig paths 对齐(跨平台、ESM 安全) */
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
});
