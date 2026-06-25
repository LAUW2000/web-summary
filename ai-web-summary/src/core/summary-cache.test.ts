import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { getCachedSummary, putCachedSummary, MAX_CACHE_ENTRIES } from './summary-cache';
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
}

beforeEach(() => installChromeMock());
afterEach(() => vi.restoreAllMocks());

const url = 'https://ex.com/a?b=1';
const K = ProviderKind.OpenAI;

describe('summary-cache', () => {
  it('未命中返回 null', async () => {
    expect(await getCachedSummary(url, K, 'deepseek-chat')).toBeNull();
  });

  it('存入后命中', async () => {
    await putCachedSummary(url, K, 'deepseek-chat', '摘要X');
    expect(await getCachedSummary(url, K, 'deepseek-chat')).toBe('摘要X');
  });

  it('忽略 URL 锚点(#frag 视为同页)', async () => {
    await putCachedSummary('https://ex.com/a?b=1', K, 'deepseek-chat', '摘要Y');
    expect(await getCachedSummary('https://ex.com/a?b=1#section', K, 'deepseek-chat')).toBe('摘要Y');
  });

  it('不同模型 / 不同格式不命中', async () => {
    await putCachedSummary(url, K, 'deepseek-chat', '摘要Z');
    expect(await getCachedSummary(url, K, 'gpt-4o')).toBeNull();
    expect(await getCachedSummary(url, ProviderKind.Anthropic, 'deepseek-chat')).toBeNull();
  });

  it('超出上限按最旧淘汰', async () => {
    let t = 1000;
    vi.spyOn(Date, 'now').mockImplementation(() => t++);
    for (let i = 0; i < MAX_CACHE_ENTRIES + 5; i++) {
      await putCachedSummary(`https://ex.com/p${i}`, K, 'm', `s${i}`);
    }
    expect(await getCachedSummary('https://ex.com/p0', K, 'm')).toBeNull();
    expect(await getCachedSummary(`https://ex.com/p${MAX_CACHE_ENTRIES + 4}`, K, 'm')).toBe(`s${MAX_CACHE_ENTRIES + 4}`);
  });
});
