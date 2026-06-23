import { z } from 'zod';

/** 模型提供商的接口类型(决定用哪套适配器) */
export enum ProviderKind {
  /** OpenAI 格式接口(GPT、DeepSeek、本地、国产兼容服务) */
  OpenAI = 'openai',
  /** Anthropic 格式接口(Claude) */
  Anthropic = 'anthropic',
}

/** ProviderKind 的全部取值,供下拉/遍历使用 */
export const PROVIDER_KIND_VALUES: readonly ProviderKind[] = [
  ProviderKind.OpenAI,
  ProviderKind.Anthropic,
];

/** 一条模型配置的 zod schema(用于校验来自存储/表单的数据) */
export const providerConfigSchema = z.object({
  /** 配置唯一 id */
  id: z.string().min(1),
  /** 用户起的显示名 */
  label: z.string().min(1),
  /** 接口类型 */
  kind: z.nativeEnum(ProviderKind),
  /** API 密钥 */
  apiKey: z.string().min(1),
  /** 自定义服务地址(OpenAI 类可填,留空用默认) */
  baseURL: z.string().url().optional().or(z.literal('')),
  /** 模型名 */
  model: z.string().min(1),
});

/** 一条模型配置 */
export type ProviderConfig = z.infer<typeof providerConfigSchema>;

/** 调用总结时的入参 */
export interface SummarizeParams {
  /** 已抽好(并截断过)的正文 */
  text: string;
  /** 页面语言代码,用于"跟随网页语言" */
  pageLang?: string;
  /** 取消信号,中途取消时中止 fetch */
  signal: AbortSignal;
}

/** 统一的模型适配器接口,返回逐块吐 token 的异步流 */
export interface Provider {
  /**
   * 流式总结。
   * @param params 正文、语言、取消信号
   * @returns 逐块产出文本增量的异步可迭代对象
   */
  summarize(params: SummarizeParams): AsyncIterable<string>;
}
