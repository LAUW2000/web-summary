import { describe, it, expect } from 'vitest';
import {
  ProviderKind,
  PROVIDER_KIND_VALUES,
  providerConfigSchema,
} from './types';

describe('ProviderKind', () => {
  it('VALUES 含两种 kind', () => {
    expect(PROVIDER_KIND_VALUES).toEqual([ProviderKind.OpenAI, ProviderKind.Anthropic]);
  });
});

describe('providerConfigSchema', () => {
  it('接受合法配置', () => {
    const cfg = {
      id: '1', label: '我的GPT', kind: ProviderKind.OpenAI,
      apiKey: 'sk-x', model: 'gpt-4o',
    };
    expect(providerConfigSchema.parse(cfg).model).toBe('gpt-4o');
  });

  it('拒绝缺少 apiKey 的配置', () => {
    const bad = { id: '1', label: 'x', kind: ProviderKind.OpenAI, model: 'gpt-4o' };
    expect(() => providerConfigSchema.parse(bad)).toThrow();
  });

  it('拒绝非法 kind', () => {
    const bad = { id: '1', label: 'x', kind: 'gemini', apiKey: 'k', model: 'm' };
    expect(() => providerConfigSchema.parse(bad)).toThrow();
  });
});
