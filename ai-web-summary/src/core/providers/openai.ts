import { Provider, ProviderConfig, SummarizeParams } from './types';
import { buildSystemPrompt } from '../prompt';
import { iterateSseData } from '../sse';
import { SummarizeError, SummarizeErrorKind, ABORT_ERROR_NAME } from '../errors';

/** OpenAI 官方默认服务地址 */
const DEFAULT_OPENAI_BASE = 'https://api.openai.com';

/** OpenAI 格式(/v1/chat/completions)流式适配器,兼容 DeepSeek/本地/国产服务 */
export class OpenAIProvider implements Provider {
  /** 完整的请求地址 */
  readonly endpoint: string;

  /**
   * @param config 提供商配置(apiKey、model、可选 baseURL)
   */
  constructor(private readonly config: ProviderConfig) {
    const base = (config.baseURL && config.baseURL.length > 0 ? config.baseURL : DEFAULT_OPENAI_BASE)
      .replace(/\/$/, '');
    this.endpoint = `${base}/v1/chat/completions`;
  }

  /**
   * 流式总结。
   * @param params 正文、语言、取消信号
   * @returns 逐块产出文本增量的异步可迭代对象
   */
  async *summarize(params: SummarizeParams): AsyncIterable<string> {
    let res: Response;
    try {
      res = await fetch(this.endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${this.config.apiKey}`,
        },
        body: JSON.stringify({
          model: this.config.model,
          stream: true,
          messages: [
            { role: 'system', content: buildSystemPrompt(params.pageLang) },
            { role: 'user', content: params.text },
          ],
        }),
        signal: params.signal,
      });
    } catch (e) {
      // AbortError 透传(由上层识别为用户取消),其余视为网络错误
      if (e instanceof Error && e.name === ABORT_ERROR_NAME) throw e;
      throw new SummarizeError(SummarizeErrorKind.Network, '网络错误,请重试');
    }

    if (!res.ok) throw SummarizeError.fromHttpStatus(res.status);
    if (!res.body) throw new SummarizeError(SummarizeErrorKind.ServerError, '响应为空,请重试');

    for await (const data of iterateSseData(res.body)) {
      if (data === '[DONE]') return;
      try {
        const json = JSON.parse(data);
        const delta: string | undefined = json?.choices?.[0]?.delta?.content;
        if (delta) yield delta;
      } catch {
        // 个别非 JSON 行(如心跳)忽略
      }
    }
  }
}
