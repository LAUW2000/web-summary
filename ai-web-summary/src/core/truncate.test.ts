import { describe, it, expect } from 'vitest';
import { truncateText, MAX_INPUT_CHARS } from './truncate';

describe('truncateText', () => {
  it('短文本原样返回,wasTruncated=false', () => {
    const r = truncateText('hello');
    expect(r.text).toBe('hello');
    expect(r.wasTruncated).toBe(false);
  });

  it('刚好等于上限不截断', () => {
    const s = 'a'.repeat(MAX_INPUT_CHARS);
    const r = truncateText(s);
    expect(r.text.length).toBe(MAX_INPUT_CHARS);
    expect(r.wasTruncated).toBe(false);
  });

  it('超长被截断到上限,wasTruncated=true', () => {
    const s = 'a'.repeat(MAX_INPUT_CHARS + 100);
    const r = truncateText(s);
    expect(r.text.length).toBe(MAX_INPUT_CHARS);
    expect(r.wasTruncated).toBe(true);
  });

  it('空字符串返回空且不截断', () => {
    const r = truncateText('');
    expect(r.text).toBe('');
    expect(r.wasTruncated).toBe(false);
  });
});
