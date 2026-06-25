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
});
