import {
  PORT_SUMMARIZE, MSG_EXTRACT,
  StreamMessageKind, type StreamMessage, type SummarizeRequest, type ExtractResult,
} from '@/shared/messages';
import { loadConfigs } from '@/core/storage';
import { truncateText } from '@/core/truncate';
import { createProvider } from '@/core/summarize';
import { SummarizeError, SummarizeErrorKind, ABORT_ERROR_NAME } from '@/core/errors';

/**
 * 向指定标签页的 content script 请求正文。
 * @param tabId 标签页 id
 * @returns 抽取结果
 */
async function requestExtract(tabId: number): Promise<ExtractResult> {
  return chrome.tabs.sendMessage<unknown, ExtractResult>(tabId, { type: MSG_EXTRACT });
}

/**
 * 处理一次总结请求:取正文→截断→选配置→流式回传。
 * @param port 与 popup 的长连接
 * @param req 总结请求(选中的配置 id)
 * @param signal 取消信号
 * @returns 处理完成的 Promise
 */
async function handleSummarize(
  port: chrome.runtime.Port,
  req: SummarizeRequest,
  signal: AbortSignal,
): Promise<void> {
  /** 安全地向 port 发消息(port 可能已断开) */
  const post = (m: StreamMessage) => { try { port.postMessage(m); } catch { /* 已断开 */ } };

  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab?.id) throw new SummarizeError(SummarizeErrorKind.EmptyContent, '无法获取当前标签页');

    const extracted = await requestExtract(tab.id);
    if (!extracted.text) throw new SummarizeError(SummarizeErrorKind.EmptyContent, '此页面无法提取正文');

    const { text, wasTruncated } = truncateText(extracted.text);
    if (wasTruncated) post({ kind: StreamMessageKind.Truncated });

    const configs = await loadConfigs();
    const config = configs.find((c) => c.id === req.providerId);
    if (!config) throw new SummarizeError(SummarizeErrorKind.NoConfig, '请先到设置页添加并选择模型');

    const provider = createProvider(config);
    for await (const chunk of provider.summarize({ text, pageLang: extracted.pageLang, signal })) {
      post({ kind: StreamMessageKind.Chunk, text: chunk });
    }
    post({ kind: StreamMessageKind.Done });
  } catch (e) {
    if (e instanceof Error && e.name === ABORT_ERROR_NAME) return; // 用户取消,静默
    if (e instanceof SummarizeError) {
      post({ kind: StreamMessageKind.Error, errorKind: e.kind, message: e.message });
    } else {
      post({ kind: StreamMessageKind.Error, errorKind: SummarizeErrorKind.ServerError, message: '未知错误,请重试' });
    }
  }
}

// 每个 popup 打开时建立一条 port;断开即取消正在进行的请求
chrome.runtime.onConnect.addListener((port) => {
  if (port.name !== PORT_SUMMARIZE) return;
  const controller = new AbortController();
  port.onMessage.addListener((req: SummarizeRequest) => {
    void handleSummarize(port, req, controller.signal);
  });
  port.onDisconnect.addListener(() => controller.abort());
});
