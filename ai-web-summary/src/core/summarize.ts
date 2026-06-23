import { Provider, ProviderConfig, ProviderKind } from './providers/types';
import { OpenAIProvider } from './providers/openai';
import { AnthropicProvider } from './providers/anthropic';

/**
 * 按配置的 kind 选择对应适配器。
 * @param config 模型配置
 * @returns 对应的 Provider 实例
 */
export function createProvider(config: ProviderConfig): Provider {
  switch (config.kind) {
    case ProviderKind.OpenAI:
      return new OpenAIProvider(config);
    case ProviderKind.Anthropic:
      return new AnthropicProvider(config);
  }
}
