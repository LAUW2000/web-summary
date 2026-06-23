/**
 * 组装总结用的系统提示词。
 * @param pageLang 页面语言代码(如 "zh"、"en"),可选;有则显式提示用该语言输出
 * @returns 系统提示词字符串
 */
export function buildSystemPrompt(pageLang?: string): string {
  const langHint = pageLang
    ? `页面语言为 "${pageLang}",请用该语言输出。`
    : '请使用与正文相同的语言输出。';
  return [
    '你是一个网页内容总结助手。',
    '请阅读用户提供的网页正文,提炼出关键信息,以要点列表(每行一条)的形式输出。',
    langHint,
    '只输出总结要点本身,不要添加开场白或额外说明。',
  ].join('\n');
}
