import { describe, it, expect, vi, afterEach } from 'vitest';
import { OpenAIProvider } from './openai';
import { ProviderKind } from './types';
import { SummarizeErrorKind } from '../errors';

/**
 * 构造一个返回 SSE 流的假 Response。
 * @param chunks SSE 文本分片
 * @param ok 是否成功响应
 * @param status HTTP 状态码
 */
function fakeResponse(chunks: string[], ok = true, status = 200): Response {
  const enc = new TextEncoder();
  const body = new ReadableStream<Uint8Array>({
    start(c) { for (const s of chunks) c.enqueue(enc.encode(s)); c.close(); },
  });
  return { ok, status, body } as unknown as Response;
}

const cfg = {
  id: '1', label: 'gpt', kind: ProviderKind.OpenAI,
  apiKey: 'sk-test', model: 'gpt-4o',
};

afterEach(() => vi.restoreAllMocks());

describe('OpenAIProvider', () => {
  it('解析 delta.content 并按序产出', async () => {
    const sse = [
      'data: {"choices":[{"delta":{"content":"你"}}]}\n\n',
      'data: {"choices":[{"delta":{"content":"好"}}]}\n\n',
      'data: [DONE]\n\n',
    ];
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(fakeResponse(sse)));
    const p = new OpenAIProvider(cfg);
    const out: string[] = [];
    for await (const t of p.summarize({ text: 'x', signal: new AbortController().signal })) out.push(t);
    expect(out.join('')).toBe('你好');
  });

  it('401 抛 InvalidKey', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(fakeResponse([], false, 401)));
    const p = new OpenAIProvider(cfg);
    await expect(async () => {
      for await (const _ of p.summarize({ text: 'x', signal: new AbortController().signal })) { /* drain */ }
    }).rejects.toMatchObject({ kind: SummarizeErrorKind.InvalidKey });
  });

  it('fetch 抛网络错误时映射为 Network', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('failed to fetch')));
    const p = new OpenAIProvider(cfg);
    await expect(async () => {
      for await (const _ of p.summarize({ text: 'x', signal: new AbortController().signal })) { /* drain */ }
    }).rejects.toMatchObject({ kind: SummarizeErrorKind.Network });
  });

  it('默认 baseURL 为官方地址', () => {
    expect(new OpenAIProvider(cfg).endpoint).toBe('https://api.openai.com/v1/chat/completions');
  });

  it('自定义 baseURL 生效', () => {
    const p = new OpenAIProvider({ ...cfg, baseURL: 'https://api.deepseek.com' });
    expect(p.endpoint).toBe('https://api.deepseek.com/v1/chat/completions');
  });
});
