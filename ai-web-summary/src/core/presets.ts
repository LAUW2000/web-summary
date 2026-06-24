import { ProviderKind } from './providers/types';

/** 一个"服务商·模型"预设:选中后自动带出接口格式、服务地址与模型名 */
export interface ModelPreset {
  /** 预设唯一标识(用作下拉 value) */
  id: string;
  /** 下拉显示名 */
  label: string;
  /** 接口格式 */
  kind: ProviderKind;
  /** 服务地址(官方默认留空字符串) */
  baseURL: string;
  /** 模型名 */
  model: string;
}

/** 内置的服务商·模型预设列表 */
export const MODEL_PRESETS: readonly ModelPreset[] = [
  { id: 'deepseek-chat', label: 'DeepSeek · deepseek-chat', kind: ProviderKind.OpenAI, baseURL: 'https://api.deepseek.com', model: 'deepseek-chat' },
  { id: 'deepseek-reasoner', label: 'DeepSeek · deepseek-reasoner', kind: ProviderKind.OpenAI, baseURL: 'https://api.deepseek.com', model: 'deepseek-reasoner' },
  { id: 'openai-gpt-4o', label: 'OpenAI · GPT-4o', kind: ProviderKind.OpenAI, baseURL: '', model: 'gpt-4o' },
  { id: 'openai-gpt-4o-mini', label: 'OpenAI · GPT-4o mini', kind: ProviderKind.OpenAI, baseURL: '', model: 'gpt-4o-mini' },
  { id: 'claude-3-5-sonnet', label: 'Claude · 3.5 Sonnet', kind: ProviderKind.Anthropic, baseURL: '', model: 'claude-3-5-sonnet-latest' },
  { id: 'claude-3-5-haiku', label: 'Claude · 3.5 Haiku', kind: ProviderKind.Anthropic, baseURL: '', model: 'claude-3-5-haiku-latest' },
];
