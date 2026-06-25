/**
 * 生成一个简单的唯一 id(基于时间戳 + 随机数),用于本地配置项。
 * @returns 形如 cfg_1699999999999_123456 的唯一字符串
 */
export function genId(): string {
  return `cfg_${Date.now()}_${Math.floor(Math.random() * 1e6)}`;
}
