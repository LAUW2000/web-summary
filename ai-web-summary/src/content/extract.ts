import { Readability } from '@mozilla/readability';
import { MSG_EXTRACT, type ExtractResult } from '@/shared/messages';

/**
 * 用 Readability 从当前页面 DOM 抽取正文。
 * 克隆 document 避免改动真实页面。
 * @returns 正文文本与页面语言
 */
function extractContent(): ExtractResult {
  const docClone = document.cloneNode(true) as Document;
  const article = new Readability(docClone).parse();
  const text = article?.textContent?.trim() ?? '';
  const pageLang = document.documentElement.lang || undefined;
  return { text, pageLang };
}

// 监听来自 popup/worker 的抽取请求,同步返回结果
chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg?.type === MSG_EXTRACT) {
    sendResponse(extractContent());
  }
  // 同步响应,无需返回 true
});
