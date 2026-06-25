import { loadConfigs, saveConfigs, getSelectedId, setSelectedId } from '@/core/storage';
import { MODEL_PRESETS } from '@/core/presets';
import { genId } from '@/core/id';
import { providerConfigSchema, type ProviderConfig } from '@/core/providers/types';
import {
  PORT_SUMMARIZE, StreamMessageKind,
  type StreamMessage, type SummarizeRequest,
} from '@/shared/messages';

/** 弹窗内引用的 DOM 元素集合 */
const els = {
  select: document.getElementById('model-select') as HTMLSelectElement,
  settingsBtn: document.getElementById('settings-btn') as HTMLButtonElement,
  panel: document.getElementById('settings-panel') as HTMLElement,
  presetSelect: document.getElementById('preset-select') as HTMLSelectElement,
  keyInput: document.getElementById('key-input') as HTMLInputElement,
  saveBtn: document.getElementById('save-btn') as HTMLButtonElement,
  settingsMsg: document.getElementById('settings-msg') as HTMLParagraphElement,
  savedList: document.getElementById('saved-list') as HTMLUListElement,
  summarize: document.getElementById('summarize-btn') as HTMLButtonElement,
  notice: document.getElementById('notice') as HTMLDivElement,
  result: document.getElementById('result') as HTMLPreElement,
  copy: document.getElementById('copy-btn') as HTMLButtonElement,
  refresh: document.getElementById('refresh-btn') as HTMLButtonElement,
};

/**
 * 显示总结区的提示。
 * @param text 提示文案
 * @param isError 是否错误样式
 */
function showNotice(text: string, isError = false): void {
  els.notice.textContent = text;
  els.notice.classList.toggle('error', isError);
  els.notice.hidden = false;
}

/** 用内置预设填充"添加模型"下拉。 */
function initPresetSelect(): void {
  els.presetSelect.innerHTML = '';
  for (const p of MODEL_PRESETS) {
    const opt = document.createElement('option');
    opt.value = p.id;
    opt.textContent = p.label;
    els.presetSelect.appendChild(opt);
  }
}

/**
 * 重新渲染顶部"已保存模型"下拉并恢复选中项;
 * 无配置时禁用总结按钮并自动展开设置区。
 * @returns 渲染完成的 Promise
 */
async function refreshModelSelect(): Promise<void> {
  const configs = await loadConfigs();
  els.select.innerHTML = '';
  if (configs.length === 0) {
    els.summarize.disabled = true;
    els.panel.hidden = false;
    showNotice('尚未配置模型,请在下方"添加模型"里选择预设并粘贴 API Key', true);
    return;
  }
  els.summarize.disabled = false;
  for (const c of configs) {
    const opt = document.createElement('option');
    opt.value = c.id;
    opt.textContent = c.label;
    els.select.appendChild(opt);
  }
  const selected = await getSelectedId();
  if (selected && configs.some((c) => c.id === selected)) els.select.value = selected;
}

/**
 * 重新渲染"已保存"配置列表(每条带删除按钮)。
 * @returns 渲染完成的 Promise
 */
async function refreshSavedList(): Promise<void> {
  const configs = await loadConfigs();
  els.savedList.innerHTML = '';
  for (const c of configs) {
    const li = document.createElement('li');
    const span = document.createElement('span');
    span.textContent = c.label;
    const del = document.createElement('button');
    del.textContent = '删除';
    del.addEventListener('click', async () => {
      const rest = (await loadConfigs()).filter((x) => x.id !== c.id);
      await saveConfigs(rest);
      await refreshSavedList();
      await refreshModelSelect();
    });
    li.append(span, del);
    els.savedList.appendChild(li);
  }
}

/**
 * 将当前选中的预设 + 输入的 Key 保存为一条配置,并设为当前选中。
 * @returns 保存完成的 Promise
 */
async function saveCurrentPreset(): Promise<void> {
  els.settingsMsg.textContent = '';
  const preset = MODEL_PRESETS.find((p) => p.id === els.presetSelect.value);
  if (!preset) return;
  const key = els.keyInput.value.trim();
  if (!key) { els.settingsMsg.textContent = '请填写 API Key'; return; }
  const candidate: ProviderConfig = {
    id: genId(),
    label: preset.label,
    kind: preset.kind,
    model: preset.model,
    apiKey: key,
    baseURL: preset.baseURL || undefined,
  };
  const parsed = providerConfigSchema.safeParse(candidate);
  if (!parsed.success) { els.settingsMsg.textContent = '配置无效,请重试'; return; }
  await saveConfigs([...(await loadConfigs()), parsed.data]);
  await setSelectedId(parsed.data.id);
  els.keyInput.value = '';
  els.settingsMsg.textContent = '已保存 ✓';
  els.notice.hidden = true;
  await refreshSavedList();
  await refreshModelSelect();
}

// 切换设置区展开/收起
els.settingsBtn.addEventListener('click', () => { els.panel.hidden = !els.panel.hidden; });
// 保存预设配置
els.saveBtn.addEventListener('click', () => void saveCurrentPreset());
// 切换已保存模型即记住选中项
els.select.addEventListener('change', () => void setSelectedId(els.select.value));
// 复制结果
els.copy.addEventListener('click', () => void navigator.clipboard.writeText(els.result.textContent ?? ''));

/**
 * 发起一次总结:建立 port,接收流式消息并更新界面。
 * @param force 是否忽略缓存强制重新总结
 */
function runSummarize(force: boolean): void {
  els.result.textContent = '';
  els.notice.hidden = true;
  els.copy.hidden = true;
  els.refresh.hidden = true;
  els.summarize.disabled = true;
  let fromCache = false;

  const port = chrome.runtime.connect({ name: PORT_SUMMARIZE });
  port.onMessage.addListener((m: StreamMessage) => {
    switch (m.kind) {
      case StreamMessageKind.Chunk:
        els.result.textContent += m.text;
        break;
      case StreamMessageKind.Truncated:
        showNotice('内容较长,已截断后部分再总结');
        break;
      case StreamMessageKind.Cached:
        fromCache = true;
        showNotice('本页摘要来自缓存,如需最新可点「重新总结」');
        break;
      case StreamMessageKind.Done:
        els.summarize.disabled = false;
        if (els.result.textContent) els.copy.hidden = false;
        if (fromCache) els.refresh.hidden = false;
        break;
      case StreamMessageKind.Error:
        showNotice(m.message, true);
        els.summarize.disabled = false;
        break;
    }
  });
  const req: SummarizeRequest = { providerId: els.select.value, force };
  port.postMessage(req);
}

// 点击总结(优先用缓存)
els.summarize.addEventListener('click', () => runSummarize(false));
// 忽略缓存强制重新总结
els.refresh.addEventListener('click', () => runSummarize(true));

// 初始化
initPresetSelect();
void refreshSavedList();
void refreshModelSelect();
