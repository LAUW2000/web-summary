/** 发给模型的正文最大字符数(粗略对应安全 token 预算,留足总结输出空间) */
export const MAX_INPUT_CHARS = 24000;

/** 截断结果 */
export interface TruncateResult {
  /** 截断后的文本 */
  text: string;
  /** 是否发生了截断 */
  wasTruncated: boolean;
}

/**
 * 将正文截断到 MAX_INPUT_CHARS 以内。
 * @param text 原始正文
 * @returns 截断后的文本与是否截断的标记
 */
export function truncateText(text: string): TruncateResult {
  if (text.length <= MAX_INPUT_CHARS) {
    return { text, wasTruncated: false };
  }
  return { text: text.slice(0, MAX_INPUT_CHARS), wasTruncated: true };
}
