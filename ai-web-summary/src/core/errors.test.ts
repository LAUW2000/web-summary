import { describe, it, expect } from 'vitest';
import { SummarizeError, SummarizeErrorKind, SUMMARIZE_ERROR_KIND_VALUES } from './errors';

describe('SummarizeError', () => {
  it('携带 kind 且 instanceof Error', () => {
    const err = new SummarizeError(SummarizeErrorKind.InvalidKey, '密钥无效');
    expect(err).toBeInstanceOf(Error);
    expect(err.kind).toBe(SummarizeErrorKind.InvalidKey);
    expect(err.message).toBe('密钥无效');
  });

  it('fromHttpStatus 把 401 映射为 InvalidKey', () => {
    expect(SummarizeError.fromHttpStatus(401).kind).toBe(SummarizeErrorKind.InvalidKey);
  });

  it('fromHttpStatus 把 429 映射为 RateLimited', () => {
    expect(SummarizeError.fromHttpStatus(429).kind).toBe(SummarizeErrorKind.RateLimited);
  });

  it('fromHttpStatus 把其他 5xx 映射为 ServerError', () => {
    expect(SummarizeError.fromHttpStatus(500).kind).toBe(SummarizeErrorKind.ServerError);
  });

  it('VALUES 数组包含全部成员', () => {
    expect(SUMMARIZE_ERROR_KIND_VALUES).toContain(SummarizeErrorKind.Network);
    expect(SUMMARIZE_ERROR_KIND_VALUES.length).toBe(6);
  });
});
