import { defineManifest } from '@crxjs/vite-plugin';

/** MV3 清单定义:声明 popup、options、后台 worker 与权限 */
export default defineManifest({
  manifest_version: 3,
  name: 'AI 网页总结',
  version: '0.1.0',
  description: '用 AI 流式总结当前网页,支持多模型,粘贴自己的 key 即用',
  // 扩展在管理页/商店等处展示的多尺寸图标
  icons: {
    16: 'icons/icon-16.png',
    32: 'icons/icon-32.png',
    48: 'icons/icon-48.png',
    128: 'icons/icon-128.png',
  },
  action: {
    default_popup: 'src/popup/popup.html',
    // 工具栏按钮图标
    default_icon: {
      16: 'icons/icon-16.png',
      32: 'icons/icon-32.png',
      48: 'icons/icon-48.png',
      128: 'icons/icon-128.png',
    },
  },
  options_page: 'src/options/options.html',
  background: { service_worker: 'src/background/service-worker.ts', type: 'module' },
  content_scripts: [
    {
      matches: ['<all_urls>'],
      js: ['src/content/extract.ts'],
      run_at: 'document_idle',
    },
  ],
  permissions: ['activeTab', 'scripting', 'storage'],
  host_permissions: ['<all_urls>'],
});
