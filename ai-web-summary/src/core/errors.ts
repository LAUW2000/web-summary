/** 总结过程中的错误类别 */
export enum SummarizeErrorKind {
  /** 未配置任何模型 / 未选中模型 */
  NoConfig = 'no_config',
  /** API 密钥无效或过期(401/403) */
  InvalidKey = 'invalid_key',
  /** 被限流或余额不足(429) */
  RateLimited = 'rate_limited',
  /** 网络错误或超时 */
  Network = 'network',
  /** 页面无法提取正文 */
  EmptyContent = 'empty_content',
  /** 服务端其他错误 */
  ServerError = 'server_error',
}

/** SummarizeErrorKind 的全部取值,供遍历使用 */
export const SUMMARIZE_ERROR_KIND_VALUES: readonly SummarizeErrorKind[] = [
  SummarizeErrorKind.NoConfig,
  SummarizeErrorKind.InvalidKey,
  SummarizeErrorKind.RateLimited,
  SummarizeErrorKind.Network,
  SummarizeErrorKind.EmptyContent,
  SummarizeErrorKind.ServerError,
];

/** 携带结构化错误类别的总结错误 */
export class SummarizeError extends Error {
  /**
   * @param kind 错误类别
   * @param message 面向用户的中文提示
   */
  constructor(public readonly kind: SummarizeErrorKind, message: string) {
    super(message);
    this.name = 'SummarizeError';
  }

  /**
   * 根据 HTTP 状态码构造对应错误。
   * @param status HTTP 状态码
   * @returns 对应类别的 SummarizeError
   */
  static fromHttpStatus(status: number): SummarizeError {
    if (status === 401 || status === 403) {
      return new SummarizeError(SummarizeErrorKind.InvalidKey, '密钥无效或已过期,请检查设置');
    }
    if (status === 429) {
      return new SummarizeError(SummarizeErrorKind.RateLimited, '请求过于频繁或余额不足,请稍后重试或换模型');
    }
    return new SummarizeError(SummarizeErrorKind.ServerError, `服务端错误(${status}),请稍后重试`);
  }
}
