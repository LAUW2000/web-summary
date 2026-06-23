import { SummarizeErrorKind } from '@/core/errors';

/** 长连接 port 的名称 */
export const PORT_SUMMARIZE = 'summarize';

/** popup → content:请求抽取当前页正文 */
export const MSG_EXTRACT = 'extract-content';

/** content → popup/worker 的正文抽取结果 */
export interface ExtractResult {
  /** 抽取到的正文(可能为空) */
  text: string;
  /** 页面语言代码 */
  pageLang?: string;
}

/** worker → popup 经 port 推送的消息类别 */
export enum StreamMessageKind {
  /** 一个文本增量块 */
  Chunk = 'chunk',
  /** 正文被截断的提示(总结开始前发一次) */
  Truncated = 'truncated',
  /** 流正常结束 */
  Done = 'done',
  /** 出错 */
  Error = 'error',
}

/** StreamMessageKind 的全部取值 */
export const STREAM_MESSAGE_KIND_VALUES: readonly StreamMessageKind[] = [
  StreamMessageKind.Chunk,
  StreamMessageKind.Truncated,
  StreamMessageKind.Done,
  StreamMessageKind.Error,
];

/** worker 经 port 推回 popup 的消息 */
export type StreamMessage =
  | { kind: StreamMessageKind.Chunk; text: string }
  | { kind: StreamMessageKind.Truncated }
  | { kind: StreamMessageKind.Done }
  | { kind: StreamMessageKind.Error; errorKind: SummarizeErrorKind; message: string };

/** popup → worker 经 port 发起的总结请求 */
export interface SummarizeRequest {
  /** 选中的配置 id */
  providerId: string;
}
