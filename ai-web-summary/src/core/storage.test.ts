import { describe, it, expect, beforeEach, vi } from 'vitest';
import { loadConfigs, saveConfigs, getSelectedId, setSelectedId } from './storage';
import { ProviderKind } from './providers/types';

/** 用内存对象模拟 chrome.storage.local */
function installChromeMock() {
  const store: Record<string, unknown> = {};
  (globalThis as any).chrome = {
    storage: {
      local: {
        get: vi.fn(async (keys: string[]) => {
          const out: Record<string, unknown> = {};
          for (const k of keys) if (k in store) out[k] = store[k];
          return out;
        }),
        set: vi.fn(async (obj: Record<string, unknown>) => { Object.assign(store, obj); }),
      },
    },
  };
  return store;
}

beforeEach(() => installChromeMock());

const cfg = { id: '1', label: 'gpt', kind: ProviderKind.OpenAI, apiKey: 'k', model: 'gpt-4o' };

describe('storage', () => {
  it('空存储时 loadConfigs 返回空数组', async () => {
    expect(await loadConfigs()).toEqual([]);
  });

  it('save 后 load 能取回(并经 schema 校验)', async () => {
    await saveConfigs([cfg]);
    const got = await loadConfigs();
    expect(got).toEqual([cfg]);
  });

  it('load 丢弃存储中不合法的脏数据', async () => {
    await saveConfigs([cfg]);
    // 手动塞一条坏数据
    await (globalThis as any).chrome.storage.local.set({ providerConfigs: [cfg, { id: 'bad' }] });
    const got = await loadConfigs();
    expect(got).toEqual([cfg]);
  });

  it('selectedId 读写', async () => {
    expect(await getSelectedId()).toBeNull();
    await setSelectedId('1');
    expect(await getSelectedId()).toBe('1');
  });
});
