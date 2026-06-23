import { defineConfig } from 'vitest/config';

/** Vitest 配置:node 环境,开启全局 API,路径别名对齐 tsconfig */
export default defineConfig({
  test: { globals: true, environment: 'node' },
  resolve: { alias: { '@': '/src' } },
});
