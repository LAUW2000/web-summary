import { describe, it, expect } from 'vitest';
import { buildSystemPrompt } from './prompt';

describe('buildSystemPrompt', () => {
  it('包含"要点"与"相同语言"的指令', () => {
    const p = buildSystemPrompt();
    expect(p).toContain('要点');
    expect(p).toContain('相同的语言');
  });

  it('传入页面语言时把语言提示带进去', () => {
    const p = buildSystemPrompt('en');
    expect(p).toContain('en');
  });

  it('始终以正文实际文字判断输出语言(页面声明不可靠时以正文为准)', () => {
    // 无声明:强调以正文判断
    expect(buildSystemPrompt()).toContain('以正文实际文字判断');
    // 有声明:声明仅供参考,以正文为准
    const p = buildSystemPrompt('en');
    expect(p).toContain('以正文为准');
  });
});
