import { loadConfigs, getSelectedId, setSelectedId } from '@/core/storage';
import {
  PORT_SUMMARIZE, StreamMessageKind,
  type StreamMessage, type SummarizeRequest,
} from '@/shared/messages';

/** 弹窗内引用的 DOM 元素集合 */
const els = {
  select: document.getElementById('model-select') as HTMLSelectElement,
  settings: document.getElementById('settings-btn') as HTMLButtonElement,
  summarize: document.getElementById('summarize-btn') as HTMLButtonElement,
  notice: document.getElementById('notice') as HTMLDivElement,
  result: document.getElementById('result') as HTMLPreElement,
  copy: document.getElementById('copy-btn') as HTMLButtonElement,
};

/**
 * 显示一条提示。
 * @param text 提示文案
 * @param isError 是否错误样式
 */
function showNotice(text: string, isError = false): void {
  els.notice.textContent = text;
  els.notice.classList.toggle('error', isError);
  els.notice.hidden = false;
}

/** 用存储中的配置填充模型下拉,并恢复上次选中项 */
async function initModelSelect(): Promise<void> {
  const configs = await loadConfigs();
  els.select.innerHTML = '';
  if (configs.length === 0) {
    showNotice('尚未配置模型,点击 ⚙️ 前往设置页添加', true);
    els.summarize.disabled = true;
    return;
  }
  for (const c of configs) {
    const opt = document.createElement('option');
    opt.value = c.id;
    opt.textContent = `${c.label}(${c.model})`;
    els.select.appendChild(opt);
  }
  const selected = await getSelectedId();
  if (selected && configs.some((c) => c.id === selected)) els.select.value = selected;
}

// 切换下拉即记住选中项
els.select.addEventListener('change', () => void setSelectedId(els.select.value));

// 打开设置页
els.settings.addEventListener('click', () => chrome.runtime.openOptionsPage());

// 复制结果
els.copy.addEventListener('click', () => void navigator.clipboard.writeText(els.result.textContent ?? ''));

// 点击总结:建立 port,接收流式消息
els.summarize.addEventListener('click', () => {
  els.result.textContent = '';
  els.notice.hidden = true;
  els.copy.hidden = true;
  els.summarize.disabled = true;

  const port = chrome.runtime.connect({ name: PORT_SUMMARIZE });
  port.onMessage.addListener((m: StreamMessage) => {
    switch (m.kind) {
      case StreamMessageKind.Chunk:
        els.result.textContent += m.text;
        break;
      case StreamMessageKind.Truncated:
        showNotice('内容较长,已截断后部分再总结');
        break;
      case StreamMessageKind.Done:
        els.summarize.disabled = false;
        if (els.result.textContent) els.copy.hidden = false;
        break;
      case StreamMessageKind.Error:
        showNotice(m.message, true);
        els.summarize.disabled = false;
        break;
    }
  });
  const req: SummarizeRequest = { providerId: els.select.value };
  port.postMessage(req);
});

void initModelSelect();
