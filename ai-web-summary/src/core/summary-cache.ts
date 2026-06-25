import { ProviderKind } from './providers/types';

/** chrome.storage.local 中保存摘要缓存的键 */
const KEY_CACHE = 'summaryCache';

/** 缓存最多保留的条目数,超出按最旧淘汰(LRU 近似:按写入时间) */
export const MAX_CACHE_ENTRIES = 100;

/** 单条缓存记录 */
interface CacheEntry {
  /** 缓存的摘要文本 */
  text: string;
  /** 写入时间戳(用于淘汰最旧) */
  ts: number;
}

/** 缓存键 → 记录 的映射 */
type CacheMap = Record<string, CacheEntry>;

/**
 * 归一化网址:去掉锚点(#fragment),使同一文档的不同锚点视为同一页面。
 * @param url 原始网址
 * @returns 去掉锚点后的网址(解析失败则原样返回)
 */
function normalizeUrl(url: string): string {
  try {
    const u = new URL(url);
    u.hash = '';
    return u.toString();
  } catch {
    return url;
  }
}

/**
 * 由网址 + 接口格式 + 模型名组合出缓存键(换模型即不同键)。
 * @param url 页面网址
 * @param kind 接口格式
 * @param model 模型名
 * @returns 缓存键
 */
function cacheKeyFor(url: string, kind: ProviderKind, model: string): string {
  return `${normalizeUrl(url)}\n${kind}:${model}`;
}

/**
 * 读取整张缓存表。
 * @returns 缓存映射(无则空对象)
 */
async function readMap(): Promise<CacheMap> {
  const got = await chrome.storage.local.get([KEY_CACHE]);
  const raw = got[KEY_CACHE];
  return raw && typeof raw === 'object' ? (raw as CacheMap) : {};
}

/**
 * 读取某页面在指定模型下的缓存摘要。
 * @param url 页面网址
 * @param kind 接口格式
 * @param model 模型名
 * @returns 命中则返回摘要文本,否则 null
 */
export async function getCachedSummary(url: string, kind: ProviderKind, model: string): Promise<string | null> {
  const map = await readMap();
  const entry = map[cacheKeyFor(url, kind, model)];
  return entry ? entry.text : null;
}

/**
 * 写入某页面在指定模型下的缓存摘要;超出条目上限时按最旧淘汰。
 * @param url 页面网址
 * @param kind 接口格式
 * @param model 模型名
 * @param text 摘要文本
 * @returns 写入完成的 Promise
 */
export async function putCachedSummary(url: string, kind: ProviderKind, model: string, text: string): Promise<void> {
  const map = await readMap();
  map[cacheKeyFor(url, kind, model)] = { text, ts: Date.now() };
  const keys = Object.keys(map);
  if (keys.length > MAX_CACHE_ENTRIES) {
    keys.sort((a, b) => map[a].ts - map[b].ts);
    for (const k of keys.slice(0, keys.length - MAX_CACHE_ENTRIES)) delete map[k];
  }
  await chrome.storage.local.set({ [KEY_CACHE]: map });
}
