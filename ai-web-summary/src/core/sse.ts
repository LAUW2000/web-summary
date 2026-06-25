/**
 * 把 SSE 字节流解析为 data 负载字符串的异步序列。
 * 只产出 `data: ` 开头行的负载(已去掉前缀);忽略空行与其他字段行。
 * @param body fetch 响应的字节流(Response.body)
 * @returns 逐个产出 data 负载字符串的异步可迭代对象
 */
export async function* iterateSseData(body: ReadableStream<Uint8Array>): AsyncIterable<string> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      let nl: number;
      // 按换行切出完整的行,残余半行留在 buffer
      while ((nl = buffer.indexOf('\n')) !== -1) {
        const line = buffer.slice(0, nl).trimEnd();
        buffer = buffer.slice(nl + 1);
        if (line.startsWith('data:')) {
          yield line.slice('data:'.length).trim();
        }
      }
    }
  } finally {
    reader.releaseLock();
  }
}
