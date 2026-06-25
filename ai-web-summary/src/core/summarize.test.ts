import { describe, it, expect } from 'vitest';
import { createProvider } from './summarize';
import { ProviderKind } from './providers/types';
import { OpenAIProvider } from './providers/openai';
import { AnthropicProvider } from './providers/anthropic';

describe('createProvider', () => {
  it('OpenAI kind 返回 OpenAIProvider', () => {
    const p = createProvider({ id: '1', label: 'x', kind: ProviderKind.OpenAI, apiKey: 'k', model: 'm' });
    expect(p).toBeInstanceOf(OpenAIProvider);
  });

  it('Anthropic kind 返回 AnthropicProvider', () => {
    const p = createProvider({ id: '1', label: 'x', kind: ProviderKind.Anthropic, apiKey: 'k', model: 'm' });
    expect(p).toBeInstanceOf(AnthropicProvider);
  });
});
