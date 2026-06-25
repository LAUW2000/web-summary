import { loadConfigs, saveConfigs } from '@/core/storage';
import { ProviderKind, providerConfigSchema, type ProviderConfig } from '@/core/providers/types';
import { genId } from '@/core/id';

/** 设置页 DOM 元素集合 */
const els = {
  list: document.getElementById('config-list') as HTMLUListElement,
  form: document.getElementById('add-form') as HTMLFormElement,
  label: document.getElementById('f-label') as HTMLInputElement,
  kind: document.getElementById('f-kind') as HTMLSelectElement,
  model: document.getElementById('f-model') as HTMLInputElement,
  key: document.getElementById('f-key') as HTMLInputElement,
  base: document.getElementById('f-base') as HTMLInputElement,
  msg: document.getElementById('msg') as HTMLParagraphElement,
};

/**
 * 重新渲染已保存的配置列表。
 * @returns 渲染完成的 Promise
 */
async function render(): Promise<void> {
  const configs = await loadConfigs();
  els.list.innerHTML = '';
  for (const c of configs) {
    const li = document.createElement('li');
    const span = document.createElement('span');
    span.textContent = `${c.label} · ${c.kind} · ${c.model}`;
    const del = document.createElement('button');
    del.textContent = '删除';
    del.addEventListener('click', async () => {
      const rest = (await loadConfigs()).filter((x) => x.id !== c.id);
      await saveConfigs(rest);
      await render();
    });
    li.append(span, del);
    els.list.appendChild(li);
  }
}

// 提交表单:校验后追加保存
els.form.addEventListener('submit', async (e) => {
  e.preventDefault();
  els.msg.textContent = '';
  const candidate: ProviderConfig = {
    id: genId(),
    label: els.label.value.trim(),
    kind: els.kind.value as ProviderKind,
    model: els.model.value.trim(),
    apiKey: els.key.value.trim(),
    baseURL: els.base.value.trim() || undefined,
  };
  const parsed = providerConfigSchema.safeParse(candidate);
  if (!parsed.success) {
    els.msg.textContent = '配置不合法,请检查各字段(baseURL 需是合法 URL 或留空)';
    return;
  }
  await saveConfigs([...(await loadConfigs()), parsed.data]);
  els.form.reset();
  await render();
});

void render();
