import { defineManifest } from '@crxjs/vite-plugin';

/** MV3 清单定义:声明 popup、options、后台 worker 与权限 */
export default defineManifest({
  manifest_version: 3,
  name: 'AI 网页总结',
  version: '0.1.0',
  description: '用 AI 流式总结当前网页,支持多模型,粘贴自己的 key 即用',
  action: { default_popup: 'src/popup/popup.html' },
  options_page: 'src/options/options.html',
  background: { service_worker: 'src/background/service-worker.ts', type: 'module' },
  permissions: ['activeTab', 'scripting', 'storage'],
  host_permissions: ['<all_urls>'],
});
