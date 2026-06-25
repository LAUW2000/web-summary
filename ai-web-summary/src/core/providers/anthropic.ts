import { Provider, ProviderConfig, SummarizeParams } from './types';
import { buildSystemPrompt } from '../prompt';
import { iterateSseData } from '../sse';
import { SummarizeError, SummarizeErrorKind, ABORT_ERROR_NAME } from '../errors';

/** Anthropic 官方默认服务地址 */
const DEFAULT_ANTHROPIC_BASE = 'https://api.anthropic.com';
/** Anthropic API 版本头 */
const ANTHROPIC_VERSION = '2023-06-01';
/** 总结输出的最大 token 数 */
const MAX_OUTPUT_TOKENS = 1024;

/** Anthropic 格式(/v1/messages)流式适配器 */
export class AnthropicProvider implements Provider {
  /** 完整的请求地址(由 baseURL 推导) */
  readonly endpoint: string;

  /**
   * @param config 提供商配置(apiKey、model、可选 baseURL)
   */
  constructor(private readonly config: ProviderConfig) {
    const base = (config.baseURL && config.baseURL.length > 0 ? config.baseURL : DEFAULT_ANTHROPIC_BASE)
      .replace(/\/$/, '');
    this.endpoint = `${base}/v1/messages`;
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
          'x-api-key': this.config.apiKey,
          'anthropic-version': ANTHROPIC_VERSION,
          // 允许浏览器扩展直连 Anthropic API
          'anthropic-dangerous-direct-browser-access': 'true',
        },
        body: JSON.stringify({
          model: this.config.model,
          stream: true,
          max_tokens: MAX_OUTPUT_TOKENS,
          system: buildSystemPrompt(params.pageLang),
          messages: [{ role: 'user', content: params.text }],
        }),
        signal: params.signal,
      });
    } catch (e) {
      if (e instanceof Error && e.name === ABORT_ERROR_NAME) throw e;
      throw new SummarizeError(SummarizeErrorKind.Network, '网络错误,请重试');
    }

    if (!res.ok) throw SummarizeError.fromHttpStatus(res.status);
    if (!res.body) throw new SummarizeError(SummarizeErrorKind.ServerError, '响应为空,请重试');

    for await (const data of iterateSseData(res.body)) {
      try {
        const json = JSON.parse(data);
        if (json?.type === 'error') {
          const msg: string | undefined = json?.error?.message;
          throw new SummarizeError(
            SummarizeErrorKind.ServerError,
            msg ? `服务端返回错误:${msg}` : '服务端返回错误,请重试',
          );
        }
        if (json?.type === 'content_block_delta' && json?.delta?.type === 'text_delta') {
          const text: string | undefined = json.delta.text;
          if (text) yield text;
        }
        if (json?.type === 'message_stop') return;
      } catch (e) {
        // SummarizeError 是我们主动抛出的错误,必须向上传播;仅忽略 JSON 解析等非预期错误
        if (e instanceof SummarizeError) throw e;
      }
    }
  }
}
