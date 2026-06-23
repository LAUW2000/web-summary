# AI 网页总结浏览器插件 实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 做一个 Chrome/Edge(MV3)插件,点击即可用 AI 流式总结当前网页正文,支持多模型,用户粘贴自己的 API key 即用。

**Architecture:** 三个 MV3 运行环境——Popup(选模型 + 总结)、Service Worker(调 AI、流式回传)、Content Script(Readability 抽正文)。纯逻辑集中在可独立单测的 `core/`,UI 与 chrome 消息收发是薄壳。配置存 `chrome.storage.local`。

**Tech Stack:** TypeScript · Vite · CRXJS · Vitest · @mozilla/readability · zod

---

## 项目规范(贯穿所有任务,见 `AGENTS.md`)

- 所有函数/方法必须有 JSDoc 中文注释,标注 `@param` / `@returns`;重要变量/常量也要中文注释。
- 有限取值一律用 TS string enum,配 `XXX_VALUES` 数组;禁止裸字符串字面量;zod 用 `z.nativeEnum`。
- 不要每改一个文件就跑 typecheck/test;攒到任务末尾「提交前」跑一次。本计划每个 Task 末尾的提交步骤即把关点。

---

## 文件结构

| 文件 | 职责 |
|------|------|
| `package.json` / `tsconfig.json` / `vite.config.ts` / `manifest.config.ts` | 工程脚手架与 MV3 清单 |
| `src/shared/messages.ts` | popup↔worker↔content 的消息类型与枚举 |
| `src/core/errors.ts` | `SummarizeErrorKind` 枚举 + `SummarizeError` 类 |
| `src/core/truncate.ts` | 正文截断 |
| `src/core/prompt.ts` | 系统提示词组装 |
| `src/core/sse.ts` | 共享的 SSE 流解析(逐行吐 data 字符串) |
| `src/core/providers/types.ts` | `ProviderKind` 枚举、`ProviderConfig`、`Provider` 接口、zod schema |
| `src/core/providers/openai.ts` | OpenAI 格式适配器 |
| `src/core/providers/anthropic.ts` | Anthropic 格式适配器 |
| `src/core/summarize.ts` | `createProvider` 工厂(按 kind 选适配器) |
| `src/core/storage.ts` | 配置 CRUD 封装(chrome.storage.local) |
| `src/content/extract.ts` | Readability 抽正文 |
| `src/background/service-worker.ts` | 编排:取正文→截断→选配置→流式回传 |
| `src/popup/{popup.html,popup.ts,popup.css}` | 弹窗 UI |
| `src/options/{options.html,options.ts,options.css}` | 设置页 UI |

---

## Task 0: 工程脚手架

**Files:**
- Create: `package.json`, `tsconfig.json`, `vite.config.ts`, `manifest.config.ts`, `vitest.config.ts`, `src/vite-env.d.ts`

- [ ] **Step 1: 初始化 package.json 与依赖**

创建 `package.json`:

```json
{
  "name": "web-summary",
  "version": "0.1.0",
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "vite build",
    "typecheck": "tsc --noEmit",
    "test": "vitest run"
  },
  "devDependencies": {
    "@crxjs/vite-plugin": "^2.0.0-beta.26",
    "@types/chrome": "^0.0.270",
    "typescript": "^5.5.0",
    "vite": "^5.4.0",
    "vitest": "^2.0.0"
  },
  "dependencies": {
    "@mozilla/readability": "^0.5.0",
    "zod": "^3.23.0"
  }
}
```

- [ ] **Step 2: 安装依赖**

Run: `npm install`
Expected: 生成 `node_modules/` 与 `package-lock.json`,无报错。

- [ ] **Step 3: 创建 tsconfig.json**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "lib": ["ES2022", "DOM", "DOM.Iterable"],
    "strict": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "types": ["chrome", "vitest/globals"],
    "baseUrl": ".",
    "paths": { "@/*": ["src/*"] }
  },
  "include": ["src", "manifest.config.ts", "vite.config.ts", "vitest.config.ts"]
}
```

- [ ] **Step 4: 创建 manifest.config.ts**

```ts
import { defineManifest } from '@crxjs/vite-plugin';

/** MV3 清单定义:声明 popup、options、后台 worker 与权限 */
export default defineManifest({
  manifest_version: 3,
  name: 'AI 网页总结',
  version: '0.1.0',
  description: '用 AI 流式总结当前网页,支持多模型,粘贴自己的 key 即用',
  action: { default_popup: 'src/popup/popup.html' },
  options_page: 'src/options/options.html',
  background: { service_worker: 'src/background/service-worker.ts', type: 'module' },
  // activeTab + scripting:点击时临时获取当前页;storage:存配置;host_permissions 留给 AI 接口
  permissions: ['activeTab', 'scripting', 'storage'],
  host_permissions: ['<all_urls>'],
});
```

- [ ] **Step 5: 创建 vite.config.ts**

```ts
import { defineConfig } from 'vite';
import { crx } from '@crxjs/vite-plugin';
import manifest from './manifest.config';

/** Vite + CRXJS 构建配置,自动处理 MV3 多入口与 manifest */
export default defineConfig({
  plugins: [crx({ manifest })],
  resolve: { alias: { '@': '/src' } },
});
```

- [ ] **Step 6: 创建 vitest.config.ts**

```ts
import { defineConfig } from 'vitest/config';

/** Vitest 配置:node 环境,开启全局 API,路径别名对齐 tsconfig */
export default defineConfig({
  test: { globals: true, environment: 'node' },
  resolve: { alias: { '@': '/src' } },
});
```

- [ ] **Step 7: 创建 src/vite-env.d.ts**

```ts
/// <reference types="vite/client" />
```

- [ ] **Step 8: 提交**

```bash
git add package.json package-lock.json tsconfig.json vite.config.ts manifest.config.ts vitest.config.ts src/vite-env.d.ts
git commit -m "chore: 初始化 Vite + CRXJS + TS 脚手架"
```

---

## Task 1: 错误类型

**Files:**
- Create: `src/core/errors.ts`
- Test: `src/core/errors.test.ts`

- [ ] **Step 1: 写失败测试**

`src/core/errors.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { SummarizeError, SummarizeErrorKind, SUMMARIZE_ERROR_KIND_VALUES } from './errors';

describe('SummarizeError', () => {
  it('携带 kind 且 instanceof Error', () => {
    const err = new SummarizeError(SummarizeErrorKind.InvalidKey, '密钥无效');
    expect(err).toBeInstanceOf(Error);
    expect(err.kind).toBe(SummarizeErrorKind.InvalidKey);
    expect(err.message).toBe('密钥无效');
  });

  it('fromHttpStatus 把 401 映射为 InvalidKey', () => {
    expect(SummarizeError.fromHttpStatus(401).kind).toBe(SummarizeErrorKind.InvalidKey);
  });

  it('fromHttpStatus 把 429 映射为 RateLimited', () => {
    expect(SummarizeError.fromHttpStatus(429).kind).toBe(SummarizeErrorKind.RateLimited);
  });

  it('fromHttpStatus 把其他 5xx 映射为 ServerError', () => {
    expect(SummarizeError.fromHttpStatus(500).kind).toBe(SummarizeErrorKind.ServerError);
  });

  it('VALUES 数组包含全部成员', () => {
    expect(SUMMARIZE_ERROR_KIND_VALUES).toContain(SummarizeErrorKind.Network);
    expect(SUMMARIZE_ERROR_KIND_VALUES.length).toBe(6);
  });
});
```

- [ ] **Step 2: 跑测试确认失败**

Run: `npx vitest run src/core/errors.test.ts`
Expected: FAIL —— 找不到模块 `./errors`。

- [ ] **Step 3: 实现 src/core/errors.ts**

```ts
/** 总结过程中的错误类别 */
export enum SummarizeErrorKind {
  /** 未配置任何模型 / 未选中模型 */
  NoConfig = 'no_config',
  /** API 密钥无效或过期(401/403) */
  InvalidKey = 'invalid_key',
  /** 被限流或余额不足(429) */
  RateLimited = 'rate_limited',
  /** 网络错误或超时 */
  Network = 'network',
  /** 页面无法提取正文 */
  EmptyContent = 'empty_content',
  /** 服务端其他错误 */
  ServerError = 'server_error',
}

/** SummarizeErrorKind 的全部取值,供遍历使用 */
export const SUMMARIZE_ERROR_KIND_VALUES: readonly SummarizeErrorKind[] = [
  SummarizeErrorKind.NoConfig,
  SummarizeErrorKind.InvalidKey,
  SummarizeErrorKind.RateLimited,
  SummarizeErrorKind.Network,
  SummarizeErrorKind.EmptyContent,
  SummarizeErrorKind.ServerError,
];

/** 携带结构化错误类别的总结错误 */
export class SummarizeError extends Error {
  /**
   * @param kind 错误类别
   * @param message 面向用户的中文提示
   */
  constructor(public readonly kind: SummarizeErrorKind, message: string) {
    super(message);
    this.name = 'SummarizeError';
  }

  /**
   * 根据 HTTP 状态码构造对应错误。
   * @param status HTTP 状态码
   * @returns 对应类别的 SummarizeError
   */
  static fromHttpStatus(status: number): SummarizeError {
    if (status === 401 || status === 403) {
      return new SummarizeError(SummarizeErrorKind.InvalidKey, '密钥无效或已过期,请检查设置');
    }
    if (status === 429) {
      return new SummarizeError(SummarizeErrorKind.RateLimited, '请求过于频繁或余额不足,请稍后重试或换模型');
    }
    return new SummarizeError(SummarizeErrorKind.ServerError, `服务端错误(${status}),请稍后重试`);
  }
}
```

- [ ] **Step 4: 跑测试确认通过**

Run: `npx vitest run src/core/errors.test.ts`
Expected: PASS(5 个用例全过)。

- [ ] **Step 5: 提交**

```bash
git add src/core/errors.ts src/core/errors.test.ts
git commit -m "feat(core): 添加结构化总结错误类型"
```

---

## Task 2: 正文截断

**Files:**
- Create: `src/core/truncate.ts`
- Test: `src/core/truncate.test.ts`

- [ ] **Step 1: 写失败测试**

`src/core/truncate.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { truncateText, MAX_INPUT_CHARS } from './truncate';

describe('truncateText', () => {
  it('短文本原样返回,wasTruncated=false', () => {
    const r = truncateText('hello');
    expect(r.text).toBe('hello');
    expect(r.wasTruncated).toBe(false);
  });

  it('刚好等于上限不截断', () => {
    const s = 'a'.repeat(MAX_INPUT_CHARS);
    const r = truncateText(s);
    expect(r.text.length).toBe(MAX_INPUT_CHARS);
    expect(r.wasTruncated).toBe(false);
  });

  it('超长被截断到上限,wasTruncated=true', () => {
    const s = 'a'.repeat(MAX_INPUT_CHARS + 100);
    const r = truncateText(s);
    expect(r.text.length).toBe(MAX_INPUT_CHARS);
    expect(r.wasTruncated).toBe(true);
  });

  it('空字符串返回空且不截断', () => {
    const r = truncateText('');
    expect(r.text).toBe('');
    expect(r.wasTruncated).toBe(false);
  });
});
```

- [ ] **Step 2: 跑测试确认失败**

Run: `npx vitest run src/core/truncate.test.ts`
Expected: FAIL —— 找不到模块 `./truncate`。

- [ ] **Step 3: 实现 src/core/truncate.ts**

```ts
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
```

- [ ] **Step 4: 跑测试确认通过**

Run: `npx vitest run src/core/truncate.test.ts`
Expected: PASS。

- [ ] **Step 5: 提交**

```bash
git add src/core/truncate.ts src/core/truncate.test.ts
git commit -m "feat(core): 添加正文截断"
```

---

## Task 3: 系统提示词

**Files:**
- Create: `src/core/prompt.ts`
- Test: `src/core/prompt.test.ts`

- [ ] **Step 1: 写失败测试**

`src/core/prompt.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { buildSystemPrompt } from './prompt';

describe('buildSystemPrompt', () => {
  it('包含"要点"与"相同语言"的指令', () => {
    const p = buildSystemPrompt();
    expect(p).toContain('要点');
    expect(p).toContain('相同的语言');
  });

  it('传入页面语言时把语言提示带进去', () => {
    const p = buildSystemPrompt('en');
    expect(p).toContain('en');
  });
});
```

- [ ] **Step 2: 跑测试确认失败**

Run: `npx vitest run src/core/prompt.test.ts`
Expected: FAIL —— 找不到模块 `./prompt`。

- [ ] **Step 3: 实现 src/core/prompt.ts**

```ts
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
```

- [ ] **Step 4: 跑测试确认通过**

Run: `npx vitest run src/core/prompt.test.ts`
Expected: PASS。

- [ ] **Step 5: 提交**

```bash
git add src/core/prompt.ts src/core/prompt.test.ts
git commit -m "feat(core): 添加系统提示词组装"
```

---

## Task 4: 共享 SSE 解析器

**Files:**
- Create: `src/core/sse.ts`
- Test: `src/core/sse.test.ts`

SSE 流以行为单位,关心 `data: ` 开头的行。本模块把 `Response.body`(字节流)解析成「data 负载字符串」的异步序列,两个适配器复用它(DRY)。

- [ ] **Step 1: 写失败测试**

`src/core/sse.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { iterateSseData } from './sse';

/**
 * 把字符串切成多个块构造成 ReadableStream,模拟网络分片到达。
 * @param chunks 字符串分片
 * @returns 一个产出 Uint8Array 的 ReadableStream
 */
function streamOf(chunks: string[]): ReadableStream<Uint8Array> {
  const enc = new TextEncoder();
  return new ReadableStream({
    start(controller) {
      for (const c of chunks) controller.enqueue(enc.encode(c));
      controller.close();
    },
  });
}

describe('iterateSseData', () => {
  it('解析逐行 data 负载', async () => {
    const stream = streamOf(['data: a\n\n', 'data: b\n\n']);
    const out: string[] = [];
    for await (const d of iterateSseData(stream)) out.push(d);
    expect(out).toEqual(['a', 'b']);
  });

  it('跨分片的半行能正确拼接', async () => {
    const stream = streamOf(['data: hel', 'lo\n\n']);
    const out: string[] = [];
    for await (const d of iterateSseData(stream)) out.push(d);
    expect(out).toEqual(['hello']);
  });

  it('忽略空行与非 data 行', async () => {
    const stream = streamOf(['event: ping\n', '\n', 'data: x\n\n']);
    const out: string[] = [];
    for await (const d of iterateSseData(stream)) out.push(d);
    expect(out).toEqual(['x']);
  });
});
```

- [ ] **Step 2: 跑测试确认失败**

Run: `npx vitest run src/core/sse.test.ts`
Expected: FAIL —— 找不到模块 `./sse`。

- [ ] **Step 3: 实现 src/core/sse.ts**

```ts
/**
 * 把 SSE 字节流解析为 data 负载字符串的异步序列。
 * 只产出 `data: ` 开头行的负载(已去掉前缀);忽略空行与其他字段行。
 * @param body fetch 响应的字节流(Response.body)
 * @returns 逐个产出 data 负载字符串的异步可迭代对象
 */
export async function* iterateSseData(body: ReadableStream<Uint8Array>): AsyncIterable<string> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      let nl: number;
      // 按换行切出完整的行,残余半行留在 buffer
      while ((nl = buffer.indexOf('\n')) !== -1) {
        const line = buffer.slice(0, nl).trimEnd();
        buffer = buffer.slice(nl + 1);
        if (line.startsWith('data:')) {
          yield line.slice('data:'.length).trim();
        }
      }
    }
  } finally {
    reader.releaseLock();
  }
}
```

- [ ] **Step 4: 跑测试确认通过**

Run: `npx vitest run src/core/sse.test.ts`
Expected: PASS。

- [ ] **Step 5: 提交**

```bash
git add src/core/sse.ts src/core/sse.test.ts
git commit -m "feat(core): 添加共享 SSE 解析器"
```

---

## Task 5: Provider 接口与类型

**Files:**
- Create: `src/core/providers/types.ts`
- Test: `src/core/providers/types.test.ts`

- [ ] **Step 1: 写失败测试**

`src/core/providers/types.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import {
  ProviderKind,
  PROVIDER_KIND_VALUES,
  providerConfigSchema,
} from './types';

describe('ProviderKind', () => {
  it('VALUES 含两种 kind', () => {
    expect(PROVIDER_KIND_VALUES).toEqual([ProviderKind.OpenAI, ProviderKind.Anthropic]);
  });
});

describe('providerConfigSchema', () => {
  it('接受合法配置', () => {
    const cfg = {
      id: '1', label: '我的GPT', kind: ProviderKind.OpenAI,
      apiKey: 'sk-x', model: 'gpt-4o',
    };
    expect(providerConfigSchema.parse(cfg).model).toBe('gpt-4o');
  });

  it('拒绝缺少 apiKey 的配置', () => {
    const bad = { id: '1', label: 'x', kind: ProviderKind.OpenAI, model: 'gpt-4o' };
    expect(() => providerConfigSchema.parse(bad)).toThrow();
  });

  it('拒绝非法 kind', () => {
    const bad = { id: '1', label: 'x', kind: 'gemini', apiKey: 'k', model: 'm' };
    expect(() => providerConfigSchema.parse(bad)).toThrow();
  });
});
```

- [ ] **Step 2: 跑测试确认失败**

Run: `npx vitest run src/core/providers/types.test.ts`
Expected: FAIL —— 找不到模块 `./types`。

- [ ] **Step 3: 实现 src/core/providers/types.ts**

```ts
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
```

- [ ] **Step 4: 跑测试确认通过**

Run: `npx vitest run src/core/providers/types.test.ts`
Expected: PASS。

- [ ] **Step 5: 提交**

```bash
git add src/core/providers/types.ts src/core/providers/types.test.ts
git commit -m "feat(core): 添加 Provider 接口与配置 schema"
```

---

## Task 6: OpenAI 适配器

**Files:**
- Create: `src/core/providers/openai.ts`
- Test: `src/core/providers/openai.test.ts`

- [ ] **Step 1: 写失败测试**

`src/core/providers/openai.test.ts`:

```ts
import { describe, it, expect, vi, afterEach } from 'vitest';
import { OpenAIProvider } from './openai';
import { ProviderKind } from './types';
import { SummarizeError, SummarizeErrorKind } from '../errors';

/**
 * 构造一个返回 SSE 流的假 Response。
 * @param chunks SSE 文本分片
 * @param ok 是否成功响应
 * @param status HTTP 状态码
 */
function fakeResponse(chunks: string[], ok = true, status = 200): Response {
  const enc = new TextEncoder();
  const body = new ReadableStream<Uint8Array>({
    start(c) { for (const s of chunks) c.enqueue(enc.encode(s)); c.close(); },
  });
  return { ok, status, body } as unknown as Response;
}

const cfg = {
  id: '1', label: 'gpt', kind: ProviderKind.OpenAI,
  apiKey: 'sk-test', model: 'gpt-4o',
};

afterEach(() => vi.restoreAllMocks());

describe('OpenAIProvider', () => {
  it('解析 delta.content 并按序产出', async () => {
    const sse = [
      'data: {"choices":[{"delta":{"content":"你"}}]}\n\n',
      'data: {"choices":[{"delta":{"content":"好"}}]}\n\n',
      'data: [DONE]\n\n',
    ];
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(fakeResponse(sse)));
    const p = new OpenAIProvider(cfg);
    const out: string[] = [];
    for await (const t of p.summarize({ text: 'x', signal: new AbortController().signal })) out.push(t);
    expect(out.join('')).toBe('你好');
  });

  it('401 抛 InvalidKey', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(fakeResponse([], false, 401)));
    const p = new OpenAIProvider(cfg);
    await expect(async () => {
      for await (const _ of p.summarize({ text: 'x', signal: new AbortController().signal })) { /* drain */ }
    }).rejects.toMatchObject({ kind: SummarizeErrorKind.InvalidKey });
  });

  it('fetch 抛网络错误时映射为 Network', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('failed to fetch')));
    const p = new OpenAIProvider(cfg);
    await expect(async () => {
      for await (const _ of p.summarize({ text: 'x', signal: new AbortController().signal })) { /* drain */ }
    }).rejects.toMatchObject({ kind: SummarizeErrorKind.Network });
  });

  it('默认 baseURL 为官方地址', () => {
    expect(new OpenAIProvider(cfg).endpoint).toBe('https://api.openai.com/v1/chat/completions');
  });

  it('自定义 baseURL 生效', () => {
    const p = new OpenAIProvider({ ...cfg, baseURL: 'https://api.deepseek.com' });
    expect(p.endpoint).toBe('https://api.deepseek.com/v1/chat/completions');
  });
});
```

- [ ] **Step 2: 跑测试确认失败**

Run: `npx vitest run src/core/providers/openai.test.ts`
Expected: FAIL —— 找不到模块 `./openai`。

- [ ] **Step 3: 实现 src/core/providers/openai.ts**

```ts
import { Provider, ProviderConfig, SummarizeParams } from './types';
import { buildSystemPrompt } from '../prompt';
import { iterateSseData } from '../sse';
import { SummarizeError, SummarizeErrorKind } from '../errors';

/** OpenAI 官方默认服务地址 */
const DEFAULT_OPENAI_BASE = 'https://api.openai.com';

/** OpenAI 格式(/v1/chat/completions)流式适配器,兼容 DeepSeek/本地/国产服务 */
export class OpenAIProvider implements Provider {
  /** 完整的请求地址 */
  readonly endpoint: string;

  /**
   * @param config 提供商配置(apiKey、model、可选 baseURL)
   */
  constructor(private readonly config: ProviderConfig) {
    const base = (config.baseURL && config.baseURL.length > 0 ? config.baseURL : DEFAULT_OPENAI_BASE)
      .replace(/\/$/, '');
    this.endpoint = `${base}/v1/chat/completions`;
  }

  /**
   * 流式总结。
   * @param params 正文、语言、取消信号
   * @returns 逐块产出文本增量的异步可迭代对象
   */
  async *summarize(params: SummarizeParams): AsyncIterable<string> {
    let res: Response;
    try {
      res = await fetch(this.endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${this.config.apiKey}`,
        },
        body: JSON.stringify({
          model: this.config.model,
          stream: true,
          messages: [
            { role: 'system', content: buildSystemPrompt(params.pageLang) },
            { role: 'user', content: params.text },
          ],
        }),
        signal: params.signal,
      });
    } catch (e) {
      // AbortError 透传(由上层识别为用户取消),其余视为网络错误
      if (e instanceof Error && e.name === 'AbortError') throw e;
      throw new SummarizeError(SummarizeErrorKind.Network, '网络错误,请重试');
    }

    if (!res.ok) throw SummarizeError.fromHttpStatus(res.status);
    if (!res.body) throw new SummarizeError(SummarizeErrorKind.ServerError, '响应为空,请重试');

    for await (const data of iterateSseData(res.body)) {
      if (data === '[DONE]') return;
      try {
        const json = JSON.parse(data);
        const delta: string | undefined = json?.choices?.[0]?.delta?.content;
        if (delta) yield delta;
      } catch {
        // 个别非 JSON 行(如心跳)忽略
      }
    }
  }
}
```

- [ ] **Step 4: 跑测试确认通过**

Run: `npx vitest run src/core/providers/openai.test.ts`
Expected: PASS(5 个用例)。

- [ ] **Step 5: 提交**

```bash
git add src/core/providers/openai.ts src/core/providers/openai.test.ts
git commit -m "feat(core): 添加 OpenAI 格式流式适配器"
```

---

## Task 7: Anthropic 适配器

**Files:**
- Create: `src/core/providers/anthropic.ts`
- Test: `src/core/providers/anthropic.test.ts`

- [ ] **Step 1: 写失败测试**

`src/core/providers/anthropic.test.ts`:

```ts
import { describe, it, expect, vi, afterEach } from 'vitest';
import { AnthropicProvider } from './anthropic';
import { ProviderKind } from './types';
import { SummarizeErrorKind } from '../errors';

function fakeResponse(chunks: string[], ok = true, status = 200): Response {
  const enc = new TextEncoder();
  const body = new ReadableStream<Uint8Array>({
    start(c) { for (const s of chunks) c.enqueue(enc.encode(s)); c.close(); },
  });
  return { ok, status, body } as unknown as Response;
}

const cfg = {
  id: '1', label: 'claude', kind: ProviderKind.Anthropic,
  apiKey: 'sk-ant', model: 'claude-3-5-sonnet-latest',
};

afterEach(() => vi.restoreAllMocks());

describe('AnthropicProvider', () => {
  it('解析 content_block_delta.delta.text', async () => {
    const sse = [
      'event: content_block_delta\n',
      'data: {"type":"content_block_delta","delta":{"type":"text_delta","text":"你"}}\n\n',
      'data: {"type":"content_block_delta","delta":{"type":"text_delta","text":"好"}}\n\n',
      'data: {"type":"message_stop"}\n\n',
    ];
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(fakeResponse(sse)));
    const p = new AnthropicProvider(cfg);
    const out: string[] = [];
    for await (const t of p.summarize({ text: 'x', signal: new AbortController().signal })) out.push(t);
    expect(out.join('')).toBe('你好');
  });

  it('429 抛 RateLimited', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(fakeResponse([], false, 429)));
    const p = new AnthropicProvider(cfg);
    await expect(async () => {
      for await (const _ of p.summarize({ text: 'x', signal: new AbortController().signal })) { /* drain */ }
    }).rejects.toMatchObject({ kind: SummarizeErrorKind.RateLimited });
  });

  it('默认 baseURL 为官方地址', () => {
    expect(new AnthropicProvider(cfg).endpoint).toBe('https://api.anthropic.com/v1/messages');
  });
});
```

- [ ] **Step 2: 跑测试确认失败**

Run: `npx vitest run src/core/providers/anthropic.test.ts`
Expected: FAIL —— 找不到模块 `./anthropic`。

- [ ] **Step 3: 实现 src/core/providers/anthropic.ts**

```ts
import { Provider, ProviderConfig, SummarizeParams } from './types';
import { buildSystemPrompt } from '../prompt';
import { iterateSseData } from '../sse';
import { SummarizeError, SummarizeErrorKind } from '../errors';

/** Anthropic 官方默认服务地址 */
const DEFAULT_ANTHROPIC_BASE = 'https://api.anthropic.com';
/** Anthropic API 版本头 */
const ANTHROPIC_VERSION = '2023-06-01';
/** 总结输出的最大 token 数 */
const MAX_OUTPUT_TOKENS = 1024;

/** Anthropic 格式(/v1/messages)流式适配器 */
export class AnthropicProvider implements Provider {
  /** 完整的请求地址 */
  readonly endpoint: string;

  /**
   * @param config 提供商配置(apiKey、model、可选 baseURL)
   */
  constructor(private readonly config: ProviderConfig) {
    const base = (config.baseURL && config.baseURL.length > 0 ? config.baseURL : DEFAULT_ANTHROPIC_BASE)
      .replace(/\/$/, '');
    this.endpoint = `${base}/v1/messages`;
  }

  /**
   * 流式总结。
   * @param params 正文、语言、取消信号
   * @returns 逐块产出文本增量的异步可迭代对象
   */
  async *summarize(params: SummarizeParams): AsyncIterable<string> {
    let res: Response;
    try {
      res = await fetch(this.endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': this.config.apiKey,
          'anthropic-version': ANTHROPIC_VERSION,
          // 允许浏览器扩展直连 Anthropic API
          'anthropic-dangerous-direct-browser-access': 'true',
        },
        body: JSON.stringify({
          model: this.config.model,
          stream: true,
          max_tokens: MAX_OUTPUT_TOKENS,
          system: buildSystemPrompt(params.pageLang),
          messages: [{ role: 'user', content: params.text }],
        }),
        signal: params.signal,
      });
    } catch (e) {
      if (e instanceof Error && e.name === 'AbortError') throw e;
      throw new SummarizeError(SummarizeErrorKind.Network, '网络错误,请重试');
    }

    if (!res.ok) throw SummarizeError.fromHttpStatus(res.status);
    if (!res.body) throw new SummarizeError(SummarizeErrorKind.ServerError, '响应为空,请重试');

    for await (const data of iterateSseData(res.body)) {
      try {
        const json = JSON.parse(data);
        if (json?.type === 'content_block_delta' && json?.delta?.type === 'text_delta') {
          const text: string | undefined = json.delta.text;
          if (text) yield text;
        }
        if (json?.type === 'message_stop') return;
      } catch {
        // 忽略非 JSON 行
      }
    }
  }
}
```

- [ ] **Step 4: 跑测试确认通过**

Run: `npx vitest run src/core/providers/anthropic.test.ts`
Expected: PASS。

- [ ] **Step 5: 提交**

```bash
git add src/core/providers/anthropic.ts src/core/providers/anthropic.test.ts
git commit -m "feat(core): 添加 Anthropic 格式流式适配器"
```

---

## Task 8: Provider 工厂

**Files:**
- Create: `src/core/summarize.ts`
- Test: `src/core/summarize.test.ts`

- [ ] **Step 1: 写失败测试**

`src/core/summarize.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { createProvider } from './summarize';
import { ProviderKind } from './providers/types';
import { OpenAIProvider } from './providers/openai';
import { AnthropicProvider } from './providers/anthropic';

describe('createProvider', () => {
  it('OpenAI kind 返回 OpenAIProvider', () => {
    const p = createProvider({ id: '1', label: 'x', kind: ProviderKind.OpenAI, apiKey: 'k', model: 'm' });
    expect(p).toBeInstanceOf(OpenAIProvider);
  });

  it('Anthropic kind 返回 AnthropicProvider', () => {
    const p = createProvider({ id: '1', label: 'x', kind: ProviderKind.Anthropic, apiKey: 'k', model: 'm' });
    expect(p).toBeInstanceOf(AnthropicProvider);
  });
});
```

- [ ] **Step 2: 跑测试确认失败**

Run: `npx vitest run src/core/summarize.test.ts`
Expected: FAIL —— 找不到模块 `./summarize`。

- [ ] **Step 3: 实现 src/core/summarize.ts**

```ts
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
```

- [ ] **Step 4: 跑测试确认通过**

Run: `npx vitest run src/core/summarize.test.ts`
Expected: PASS。

- [ ] **Step 5: 提交**

```bash
git add src/core/summarize.ts src/core/summarize.test.ts
git commit -m "feat(core): 添加 Provider 工厂"
```

---

## Task 9: 配置存储

**Files:**
- Create: `src/core/storage.ts`
- Test: `src/core/storage.test.ts`

- [ ] **Step 1: 写失败测试**

`src/core/storage.test.ts`:

```ts
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { loadConfigs, saveConfigs, getSelectedId, setSelectedId } from './storage';
import { ProviderKind } from './providers/types';

/** 用内存对象模拟 chrome.storage.local */
function installChromeMock() {
  const store: Record<string, unknown> = {};
  (globalThis as any).chrome = {
    storage: {
      local: {
        get: vi.fn(async (keys: string[]) => {
          const out: Record<string, unknown> = {};
          for (const k of keys) if (k in store) out[k] = store[k];
          return out;
        }),
        set: vi.fn(async (obj: Record<string, unknown>) => { Object.assign(store, obj); }),
      },
    },
  };
  return store;
}

beforeEach(() => installChromeMock());

const cfg = { id: '1', label: 'gpt', kind: ProviderKind.OpenAI, apiKey: 'k', model: 'gpt-4o' };

describe('storage', () => {
  it('空存储时 loadConfigs 返回空数组', async () => {
    expect(await loadConfigs()).toEqual([]);
  });

  it('save 后 load 能取回(并经 schema 校验)', async () => {
    await saveConfigs([cfg]);
    const got = await loadConfigs();
    expect(got).toEqual([cfg]);
  });

  it('load 丢弃存储中不合法的脏数据', async () => {
    await saveConfigs([cfg]);
    // 手动塞一条坏数据
    await (globalThis as any).chrome.storage.local.set({ providerConfigs: [cfg, { id: 'bad' }] });
    const got = await loadConfigs();
    expect(got).toEqual([cfg]);
  });

  it('selectedId 读写', async () => {
    expect(await getSelectedId()).toBeNull();
    await setSelectedId('1');
    expect(await getSelectedId()).toBe('1');
  });
});
```

- [ ] **Step 2: 跑测试确认失败**

Run: `npx vitest run src/core/storage.test.ts`
Expected: FAIL —— 找不到模块 `./storage`。

- [ ] **Step 3: 实现 src/core/storage.ts**

```ts
import { ProviderConfig, providerConfigSchema } from './providers/types';

/** chrome.storage.local 中保存配置列表的键 */
const KEY_CONFIGS = 'providerConfigs';
/** chrome.storage.local 中保存当前选中配置 id 的键 */
const KEY_SELECTED = 'selectedProviderId';

/**
 * 读取全部模型配置,逐条经 schema 校验,丢弃脏数据。
 * @returns 合法的配置数组(无则空数组)
 */
export async function loadConfigs(): Promise<ProviderConfig[]> {
  const got = await chrome.storage.local.get([KEY_CONFIGS]);
  const raw = got[KEY_CONFIGS];
  if (!Array.isArray(raw)) return [];
  const valid: ProviderConfig[] = [];
  for (const item of raw) {
    const parsed = providerConfigSchema.safeParse(item);
    if (parsed.success) valid.push(parsed.data);
  }
  return valid;
}

/**
 * 覆盖保存模型配置列表。
 * @param configs 配置数组
 * @returns 写入完成的 Promise
 */
export async function saveConfigs(configs: ProviderConfig[]): Promise<void> {
  await chrome.storage.local.set({ [KEY_CONFIGS]: configs });
}

/**
 * 读取当前选中的配置 id。
 * @returns 选中的 id;未设置则 null
 */
export async function getSelectedId(): Promise<string | null> {
  const got = await chrome.storage.local.get([KEY_SELECTED]);
  const id = got[KEY_SELECTED];
  return typeof id === 'string' ? id : null;
}

/**
 * 设置当前选中的配置 id。
 * @param id 配置 id
 * @returns 写入完成的 Promise
 */
export async function setSelectedId(id: string): Promise<void> {
  await chrome.storage.local.set({ [KEY_SELECTED]: id });
}
```

- [ ] **Step 4: 跑测试确认通过**

Run: `npx vitest run src/core/storage.test.ts`
Expected: PASS。

- [ ] **Step 5: 提交**

```bash
git add src/core/storage.ts src/core/storage.test.ts
git commit -m "feat(core): 添加配置存储封装"
```

---

## Task 10: 消息协议

**Files:**
- Create: `src/shared/messages.ts`

无独立测试(纯类型定义),由后续使用它的 worker/popup 间接验证;末尾跑 typecheck 把关。

- [ ] **Step 1: 实现 src/shared/messages.ts**

```ts
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
```

- [ ] **Step 2: 跑 typecheck 把关**

Run: `npm run typecheck`
Expected: 无错误(此前所有 core 文件 + 本文件类型一致)。

- [ ] **Step 3: 提交**

```bash
git add src/shared/messages.ts
git commit -m "feat(shared): 添加跨环境消息协议"
```

---

## Task 11: Content Script 抽正文

**Files:**
- Create: `src/content/extract.ts`

抽正文依赖真实 DOM 与 Readability,不做单测,靠后续手动加载实测(Task 14)。

- [ ] **Step 1: 实现 src/content/extract.ts**

```ts
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
```

- [ ] **Step 2: 在 manifest 注册 content script**

Modify: `manifest.config.ts` —— 在 `defineManifest({...})` 对象中加入 `content_scripts` 字段(与 `background` 同级):

```ts
  content_scripts: [
    {
      matches: ['<all_urls>'],
      js: ['src/content/extract.ts'],
      run_at: 'document_idle',
    },
  ],
```

- [ ] **Step 3: 跑 typecheck 把关**

Run: `npm run typecheck`
Expected: 无错误。

- [ ] **Step 4: 提交**

```bash
git add src/content/extract.ts manifest.config.ts
git commit -m "feat(content): 添加 Readability 正文抽取"
```

---

## Task 12: Service Worker 编排

**Files:**
- Create: `src/background/service-worker.ts`

后台编排依赖 chrome API 与多环境通信,不做单测,核心逻辑(适配器/截断/工厂)已在 core 单测覆盖。

- [ ] **Step 1: 实现 src/background/service-worker.ts**

```ts
import {
  PORT_SUMMARIZE, MSG_EXTRACT,
  StreamMessageKind, type StreamMessage, type SummarizeRequest, type ExtractResult,
} from '@/shared/messages';
import { loadConfigs } from '@/core/storage';
import { truncateText } from '@/core/truncate';
import { createProvider } from '@/core/summarize';
import { SummarizeError, SummarizeErrorKind } from '@/core/errors';

/**
 * 向指定标签页的 content script 请求正文。
 * @param tabId 标签页 id
 * @returns 抽取结果
 */
async function requestExtract(tabId: number): Promise<ExtractResult> {
  return chrome.tabs.sendMessage(tabId, { type: MSG_EXTRACT });
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
    if (e instanceof Error && e.name === 'AbortError') return; // 用户取消,静默
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
```

- [ ] **Step 2: 跑 typecheck 把关**

Run: `npm run typecheck`
Expected: 无错误。

- [ ] **Step 3: 提交**

```bash
git add src/background/service-worker.ts
git commit -m "feat(background): 添加总结编排 worker"
```

---

## Task 13: Popup 与 Options UI

**Files:**
- Create: `src/popup/popup.html`, `src/popup/popup.ts`, `src/popup/popup.css`
- Create: `src/options/options.html`, `src/options/options.ts`, `src/options/options.css`

UI 为薄壳,靠 Task 14 手动实测验证。

- [ ] **Step 1: 创建 src/popup/popup.html**

```html
<!doctype html>
<html lang="zh">
  <head>
    <meta charset="utf-8" />
    <link rel="stylesheet" href="./popup.css" />
  </head>
  <body>
    <header>
      <select id="model-select" title="选择模型"></select>
      <button id="settings-btn" title="设置">⚙️</button>
    </header>
    <button id="summarize-btn">总结此页</button>
    <div id="notice" class="notice" hidden></div>
    <pre id="result" class="result"></pre>
    <button id="copy-btn" hidden>复制</button>
    <script type="module" src="./popup.ts"></script>
  </body>
</html>
```

- [ ] **Step 2: 创建 src/popup/popup.css**

```css
/** 弹窗整体尺寸与基础排版 */
body { width: 360px; margin: 0; padding: 12px; font: 14px/1.5 system-ui, sans-serif; }
header { display: flex; gap: 8px; margin-bottom: 8px; }
#model-select { flex: 1; }
#summarize-btn { width: 100%; padding: 8px; cursor: pointer; }
.notice { background: #fff7e6; border: 1px solid #ffd591; padding: 6px; margin: 8px 0; font-size: 12px; }
.notice.error { background: #fff1f0; border-color: #ffa39e; }
.result { white-space: pre-wrap; word-break: break-word; min-height: 60px; margin: 8px 0; }
#copy-btn { width: 100%; padding: 6px; cursor: pointer; }
```

- [ ] **Step 3: 创建 src/popup/popup.ts**

```ts
import { loadConfigs, getSelectedId, setSelectedId } from '@/core/storage';
import {
  PORT_SUMMARIZE, StreamMessageKind,
  type StreamMessage, type SummarizeRequest,
} from '@/shared/messages';

/** 弹窗内引用的 DOM 元素集合 */
const els = {
  select: document.getElementById('model-select') as HTMLSelectElement,
  settings: document.getElementById('settings-btn') as HTMLButtonElement,
  summarize: document.getElementById('summarize-btn') as HTMLButtonElement,
  notice: document.getElementById('notice') as HTMLDivElement,
  result: document.getElementById('result') as HTMLPreElement,
  copy: document.getElementById('copy-btn') as HTMLButtonElement,
};

/**
 * 显示一条提示。
 * @param text 提示文案
 * @param isError 是否错误样式
 */
function showNotice(text: string, isError = false): void {
  els.notice.textContent = text;
  els.notice.classList.toggle('error', isError);
  els.notice.hidden = false;
}

/** 用存储中的配置填充模型下拉,并恢复上次选中项 */
async function initModelSelect(): Promise<void> {
  const configs = await loadConfigs();
  els.select.innerHTML = '';
  if (configs.length === 0) {
    showNotice('尚未配置模型,点击 ⚙️ 前往设置页添加', true);
    els.summarize.disabled = true;
    return;
  }
  for (const c of configs) {
    const opt = document.createElement('option');
    opt.value = c.id;
    opt.textContent = `${c.label}(${c.model})`;
    els.select.appendChild(opt);
  }
  const selected = await getSelectedId();
  if (selected && configs.some((c) => c.id === selected)) els.select.value = selected;
}

// 切换下拉即记住选中项
els.select.addEventListener('change', () => void setSelectedId(els.select.value));

// 打开设置页
els.settings.addEventListener('click', () => chrome.runtime.openOptionsPage());

// 复制结果
els.copy.addEventListener('click', () => void navigator.clipboard.writeText(els.result.textContent ?? ''));

// 点击总结:建立 port,接收流式消息
els.summarize.addEventListener('click', () => {
  els.result.textContent = '';
  els.notice.hidden = true;
  els.copy.hidden = true;
  els.summarize.disabled = true;

  const port = chrome.runtime.connect({ name: PORT_SUMMARIZE });
  port.onMessage.addListener((m: StreamMessage) => {
    switch (m.kind) {
      case StreamMessageKind.Chunk:
        els.result.textContent += m.text;
        break;
      case StreamMessageKind.Truncated:
        showNotice('内容较长,已截断后部分再总结');
        break;
      case StreamMessageKind.Done:
        els.summarize.disabled = false;
        if (els.result.textContent) els.copy.hidden = false;
        break;
      case StreamMessageKind.Error:
        showNotice(m.message, true);
        els.summarize.disabled = false;
        break;
    }
  });
  const req: SummarizeRequest = { providerId: els.select.value };
  port.postMessage(req);
});

void initModelSelect();
```

- [ ] **Step 4: 创建 src/options/options.html**

```html
<!doctype html>
<html lang="zh">
  <head>
    <meta charset="utf-8" />
    <link rel="stylesheet" href="./options.css" />
  </head>
  <body>
    <h1>模型配置</h1>
    <ul id="config-list"></ul>
    <h2>添加配置</h2>
    <form id="add-form">
      <input id="f-label" placeholder="显示名,如 我的GPT" required />
      <select id="f-kind">
        <option value="openai">OpenAI 格式(GPT / DeepSeek / 本地)</option>
        <option value="anthropic">Anthropic 格式(Claude)</option>
      </select>
      <input id="f-model" placeholder="模型名,如 gpt-4o" required />
      <input id="f-key" placeholder="API Key" required />
      <input id="f-base" placeholder="自定义 baseURL(可选,如 https://api.deepseek.com)" />
      <button type="submit">添加</button>
    </form>
    <p id="msg"></p>
    <script type="module" src="./options.ts"></script>
  </body>
</html>
```

- [ ] **Step 5: 创建 src/options/options.css**

```css
/** 设置页基础排版 */
body { max-width: 560px; margin: 24px auto; font: 14px/1.6 system-ui, sans-serif; padding: 0 16px; }
form { display: flex; flex-direction: column; gap: 8px; }
input, select, button { padding: 6px; font-size: 14px; }
#config-list { list-style: none; padding: 0; }
#config-list li { display: flex; justify-content: space-between; align-items: center; border: 1px solid #ddd; padding: 8px; margin-bottom: 6px; border-radius: 6px; }
#msg { color: #c00; min-height: 1.2em; }
```

- [ ] **Step 6: 创建 src/options/options.ts**

```ts
import { loadConfigs, saveConfigs } from '@/core/storage';
import { ProviderKind, providerConfigSchema, type ProviderConfig } from '@/core/providers/types';

/** 设置页 DOM 元素集合 */
const els = {
  list: document.getElementById('config-list') as HTMLUListElement,
  form: document.getElementById('add-form') as HTMLFormElement,
  label: document.getElementById('f-label') as HTMLInputElement,
  kind: document.getElementById('f-kind') as HTMLSelectElement,
  model: document.getElementById('f-model') as HTMLInputElement,
  key: document.getElementById('f-key') as HTMLInputElement,
  base: document.getElementById('f-base') as HTMLInputElement,
  msg: document.getElementById('msg') as HTMLParagraphElement,
};

/** 生成一个简单的唯一 id(基于时间戳) */
function genId(): string {
  return `cfg_${Date.now()}_${Math.floor(Math.random() * 1e6)}`;
}

/** 重新渲染已保存的配置列表 */
async function render(): Promise<void> {
  const configs = await loadConfigs();
  els.list.innerHTML = '';
  for (const c of configs) {
    const li = document.createElement('li');
    const span = document.createElement('span');
    span.textContent = `${c.label} · ${c.kind} · ${c.model}`;
    const del = document.createElement('button');
    del.textContent = '删除';
    del.addEventListener('click', async () => {
      const rest = (await loadConfigs()).filter((x) => x.id !== c.id);
      await saveConfigs(rest);
      await render();
    });
    li.append(span, del);
    els.list.appendChild(li);
  }
}

// 提交表单:校验后追加保存
els.form.addEventListener('submit', async (e) => {
  e.preventDefault();
  els.msg.textContent = '';
  const candidate: ProviderConfig = {
    id: genId(),
    label: els.label.value.trim(),
    kind: els.kind.value as ProviderKind,
    model: els.model.value.trim(),
    apiKey: els.key.value.trim(),
    baseURL: els.base.value.trim() || undefined,
  };
  const parsed = providerConfigSchema.safeParse(candidate);
  if (!parsed.success) {
    els.msg.textContent = '配置不合法,请检查各字段(baseURL 需是合法 URL 或留空)';
    return;
  }
  await saveConfigs([...(await loadConfigs()), parsed.data]);
  els.form.reset();
  await render();
});

void render();
```

- [ ] **Step 7: 跑 typecheck 把关**

Run: `npm run typecheck`
Expected: 无错误。

- [ ] **Step 8: 提交**

```bash
git add src/popup src/options
git commit -m "feat(ui): 添加弹窗与设置页"
```

---

## Task 14: 构建、手动加载与端到端验证

**Files:** 无新增,验证整体。

- [ ] **Step 1: 全量类型检查 + 单测**

Run: `npm run typecheck && npm test`
Expected: typecheck 无错误;Vitest 全部用例 PASS。

- [ ] **Step 2: 构建**

Run: `npm run build`
Expected: 生成 `dist/`,含 `manifest.json` 与各入口产物,无报错。

- [ ] **Step 3: Chrome 加载已解压扩展**

操作:打开 `chrome://extensions` → 开启「开发者模式」→「加载已解压的扩展程序」→ 选择 `dist/` 目录。
Expected: 扩展出现在列表,无错误徽标。

- [ ] **Step 4: 配置一个模型**

操作:点扩展图标 → ⚙️ 打开设置页 → 填一条配置(如 DeepSeek:kind=OpenAI 格式、model=`deepseek-chat`、baseURL=`https://api.deepseek.com`、填真实 key)→ 添加。
Expected: 列表出现该配置。

- [ ] **Step 5: 在一篇文章页总结**

操作:打开任意一篇文章网页 → 点扩展图标 → 下拉选中刚配置的模型 → 点「总结此页」。
Expected: 结果区逐字流式出现要点式中文/原语言总结;结束后出现「复制」按钮。

- [ ] **Step 6: 验证错误路径**

操作:把设置页里的 key 改成错的 → 再次总结。
Expected: 顶部红色提示「密钥无效或已过期,请检查设置」,不崩溃。

- [ ] **Step 7: 提交(若有构建配置微调)**

```bash
git add -A
git commit -m "chore: 端到端验证通过"
```

---

## 自检结果

- **Spec 覆盖**:浏览器(MV3,Task 0 manifest)、OpenAI/Anthropic 适配器(Task 6/7)、长页面抽取+截断(Task 2/11)、弹窗+设置页(Task 13)、配置存储(Task 9)、流式(SSE Task 4 + 适配器)、跟随语言要点式输出(Task 3)、错误处理(Task 1 + worker Task 12)、测试策略(各 core 任务 TDD + Task 14 手动)、技术栈(Task 0)。均有对应任务。
- **占位符**:无 TBD/TODO;每个代码步骤含完整代码。
- **类型一致性**:`ProviderKind` / `ProviderConfig` / `SummarizeError` / `StreamMessageKind` / `createProvider` / `truncateText` / `iterateSseData` / storage 函数名在定义与使用处一致。
