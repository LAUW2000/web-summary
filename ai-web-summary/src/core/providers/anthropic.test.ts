import { describe, it, expect, vi, afterEach } from 'vitest';
import { AnthropicProvider } from './anthropic';
import { ProviderKind } from './types';
import { SummarizeErrorKind } from '../errors';

function fakeResponse(chunks: string[], ok = true, status = 200): Response {
  const enc = new TextEncoder();
  const body = new ReadableStream<Uint8Array>({
    start(c) { for (const s of chunks) c.enqueue(enc.encode(s)); c.close(); },
  });
  return { ok, status, body } as unknown as Response;
}

const cfg = {
  id: '1', label: 'claude', kind: ProviderKind.Anthropic,
  apiKey: 'sk-ant', model: 'claude-3-5-sonnet-latest',
};

afterEach(() => vi.restoreAllMocks());

describe('AnthropicProvider', () => {
  it('解析 content_block_delta.delta.text', async () => {
    const sse = [
      'event: content_block_delta\n',
      'data: {"type":"content_block_delta","delta":{"type":"text_delta","text":"你"}}\n\n',
      'data: {"type":"content_block_delta","delta":{"type":"text_delta","text":"好"}}\n\n',
      'data: {"type":"message_stop"}\n\n',
    ];
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(fakeResponse(sse)));
    const p = new AnthropicProvider(cfg);
    const out: string[] = [];
    for await (const t of p.summarize({ text: 'x', signal: new AbortController().signal })) out.push(t);
    expect(out.join('')).toBe('你好');
  });

  it('429 抛 RateLimited', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(fakeResponse([], false, 429)));
    const p = new AnthropicProvider(cfg);
    await expect(async () => {
      for await (const _ of p.summarize({ text: 'x', signal: new AbortController().signal })) { /* drain */ }
    }).rejects.toMatchObject({ kind: SummarizeErrorKind.RateLimited });
  });

  it('流式 error 事件抛 ServerError', async () => {
    const sse = [
      'data: {"type":"error","error":{"type":"overloaded_error","message":"过载"}}\n\n',
    ];
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(fakeResponse(sse)));
    const p = new AnthropicProvider(cfg);
    await expect(async () => {
      for await (const _ of p.summarize({ text: 'x', signal: new AbortController().signal })) { /* drain */ }
    }).rejects.toMatchObject({ kind: SummarizeErrorKind.ServerError });
  });

  it('默认 baseURL 为官方地址', () => {
    expect(new AnthropicProvider(cfg).endpoint).toBe('https://api.anthropic.com/v1/messages');
  });
});
