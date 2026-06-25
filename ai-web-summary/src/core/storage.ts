import { ProviderConfig, providerConfigSchema } from './providers/types';

/** chrome.storage.local 中保存配置列表的键 */
const KEY_CONFIGS = 'providerConfigs';
/** chrome.storage.local 中保存当前选中配置 id 的键 */
const KEY_SELECTED = 'selectedProviderId';

/**
 * 读取全部模型配置,逐条经 schema 校验,丢弃脏数据。
 * @returns 合法的配置数组(无则空数组)
 */
export async function loadConfigs(): Promise<ProviderConfig[]> {
  const got = await chrome.storage.local.get([KEY_CONFIGS]);
  const raw = got[KEY_CONFIGS];
  if (!Array.isArray(raw)) return [];
  const valid: ProviderConfig[] = [];
  for (const item of raw) {
    const parsed = providerConfigSchema.safeParse(item);
    if (parsed.success) valid.push(parsed.data);
  }
  return valid;
}

/**
 * 覆盖保存模型配置列表。
 * @param configs 配置数组
 * @returns 写入完成的 Promise
 */
export async function saveConfigs(configs: ProviderConfig[]): Promise<void> {
  await chrome.storage.local.set({ [KEY_CONFIGS]: configs });
}

/**
 * 读取当前选中的配置 id。
 * @returns 选中的 id;未设置则 null
 */
export async function getSelectedId(): Promise<string | null> {
  const got = await chrome.storage.local.get([KEY_SELECTED]);
  const id = got[KEY_SELECTED];
  return typeof id === 'string' ? id : null;
}

/**
 * 设置当前选中的配置 id。
 * @param id 配置 id
 * @returns 写入完成的 Promise
 */
export async function setSelectedId(id: string): Promise<void> {
  await chrome.storage.local.set({ [KEY_SELECTED]: id });
}
