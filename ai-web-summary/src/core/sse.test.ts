import { describe, it, expect } from 'vitest';
import { iterateSseData } from './sse';

/**
 * 把字符串切成多个块构造成 ReadableStream,模拟网络分片到达。
 * @param chunks 字符串分片
 * @returns 一个产出 Uint8Array 的 ReadableStream
 */
function streamOf(chunks: string[]): ReadableStream<Uint8Array> {
  const enc = new TextEncoder();
  return new ReadableStream({
    start(controller) {
      for (const c of chunks) controller.enqueue(enc.encode(c));
      controller.close();
    },
  });
}

describe('iterateSseData', () => {
  it('解析逐行 data 负载', async () => {
    const stream = streamOf(['data: a\n\n', 'data: b\n\n']);
    const out: string[] = [];
    for await (const d of iterateSseData(stream)) out.push(d);
    expect(out).toEqual(['a', 'b']);
  });

  it('跨分片的半行能正确拼接', async () => {
    const stream = streamOf(['data: hel', 'lo\n\n']);
    const out: string[] = [];
    for await (const d of iterateSseData(stream)) out.push(d);
    expect(out).toEqual(['hello']);
  });

  it('忽略空行与非 data 行', async () => {
    const stream = streamOf(['event: ping\n', '\n', 'data: x\n\n']);
    const out: string[] = [];
    for await (const d of iterateSseData(stream)) out.push(d);
    expect(out).toEqual(['x']);
  });
});
